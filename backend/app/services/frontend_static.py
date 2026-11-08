"""Serve the built frontend with pre-compressed siblings and cache headers.

The Vite build writes ``.br`` and ``.gz`` siblings for JS, CSS, SVG and JSON
(see ``frontend/scripts/compress-dist.mjs``). This module picks the best sibling
the client accepts, adds ``Vary: Accept-Encoding``, and sets a long-lived
immutable cache header for content-hashed ``/assets/*`` files while keeping
``index.html`` and the service worker revalidated on every load.
"""

from __future__ import annotations

import mimetypes
import re
from pathlib import Path, PurePosixPath, PureWindowsPath

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from loguru import logger

from app import __version__

IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"
NO_CACHE_CONTROL = "no-cache"

# Vite emits an 8+ character base64url content hash as the last segment
# before the extension, e.g. ``index-B51Nxhm5.js`` or
# ``RegionHeaderControls-jKZQ0Ij-.css``. Requiring an uppercase letter or digit
# in that segment keeps human-readable names such as ``my-long-name.js`` from
# being treated as immutable.
_HASHED_FILENAME = re.compile(
    r"-(?=[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$)(?=[A-Za-z0-9_-]*[A-Z0-9])"
    r"[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$"
)

# Preference order also breaks a q-value tie: brotli first.
_ENCODING_SUFFIX = {"br": ".br", "gzip": ".gz"}

# Compressed siblings are only reachable through content negotiation.
_COMPRESSED_SUFFIXES = (".br", ".gz")

# Percent-encoded dots/slashes arrive decoded by Starlette; reject them before
# resolving so a double-encoded path cannot smuggle a traversal through.
_FORBIDDEN_PATH_FRAGMENTS = ("%2e", "%2f", "%5c")


def _is_safe_relative_path(relative_path: str) -> bool:
    """Reject absolute, NUL, backslash and encoded-traversal path input."""
    if not relative_path or "\x00" in relative_path or "\\" in relative_path:
        return False
    lowered = relative_path.lower()
    if any(fragment in lowered for fragment in _FORBIDDEN_PATH_FRAGMENTS):
        return False
    if PurePosixPath(relative_path).is_absolute() or PureWindowsPath(relative_path).is_absolute():
        return False
    return ".." not in PurePosixPath(relative_path).parts


def _resolve_inside(root: Path, relative_path: str) -> Path | None:
    """Resolve a request path and require it to stay inside the dist root."""
    if not _is_safe_relative_path(relative_path):
        return None
    resolved = (root / relative_path).resolve()
    if not resolved.is_relative_to(root):
        return None
    return resolved


def _safe_sibling(path: Path, suffix: str, root: Path) -> Path | None:
    """Return a compressed sibling only when it resolves inside the dist root."""
    sibling = Path(f"{path}{suffix}")
    if not sibling.exists() and not sibling.is_symlink():
        return None
    resolved = sibling.resolve()
    if not resolved.is_relative_to(root):
        raise HTTPException(status_code=404, detail="Not found")
    return resolved if resolved.is_file() else None


def _parse_accept_encoding(header: str | None) -> dict[str, float]:
    """Parse ``Accept-Encoding`` into ``{coding: q}``; malformed q-values mean 0."""
    accepted: dict[str, float] = {}
    if not header:
        return accepted
    for item in header.split(","):
        token, _, params = item.strip().partition(";")
        token = token.strip().lower()
        if not token:
            continue
        quality = 1.0
        for param in params.split(";"):
            key, _, value = param.strip().partition("=")
            if key.strip().lower() == "q":
                try:
                    quality = float(value)
                except ValueError:
                    quality = 0.0
        accepted[token] = quality
    return accepted


def _quality(accepted: dict[str, float], coding: str) -> float:
    if coding in accepted:
        return accepted[coding]
    return accepted.get("*", 0.0)


def select_encoding(accept_encoding: str | None, available: set[str]) -> str | None:
    """Return the best available coding for the request, or ``None`` for identity."""
    accepted = _parse_accept_encoding(accept_encoding)
    candidates = [
        (coding, _quality(accepted, coding)) for coding in _ENCODING_SUFFIX if coding in available
    ]
    candidates = [(coding, quality) for coding, quality in candidates if quality > 0]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[1])[0]


def cache_control_for(relative_path: str) -> str:
    """Content-hashed build assets are immutable; everything else revalidates."""
    path = PurePosixPath(relative_path)
    if path.parts and path.parts[0] == "assets" and _HASHED_FILENAME.search(path.name):
        return IMMUTABLE_CACHE_CONTROL
    return NO_CACHE_CONTROL


def _static_response(path: Path, request: Request, relative_path: str, root: Path) -> FileResponse:
    available: set[str] = set()
    siblings: dict[str, Path] = {}
    for coding, suffix in _ENCODING_SUFFIX.items():
        sibling = _safe_sibling(path, suffix, root)
        if sibling is not None:
            available.add(coding)
            siblings[coding] = sibling

    encoding = select_encoding(request.headers.get("accept-encoding"), available)
    served_path = siblings[encoding] if encoding else path

    headers = {
        "Cache-Control": cache_control_for(relative_path),
        "Vary": "Accept-Encoding",
    }
    if encoding:
        headers["Content-Encoding"] = encoding

    # The sibling suffix confuses mimetypes, so always type the original file.
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(str(served_path), media_type=media_type, headers=headers)


def _serve_static_file(root: Path, relative_path: str, request: Request) -> FileResponse:
    """Resolve, validate and serve one file from the dist root."""
    if relative_path.lower().endswith(_COMPRESSED_SUFFIXES):
        raise HTTPException(status_code=404, detail="Not found")
    resolved = _resolve_inside(root, relative_path)
    if resolved is None or not resolved.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return _static_response(resolved, request, relative_path, root)


def register_frontend_static_routes(app: FastAPI, dist_dir: Path) -> None:
    """Wire up assets, public files, share pages and the SPA fallback."""
    dist_dir = Path(dist_dir)
    root = dist_dir.resolve()
    assets_dir = root / "assets"
    index_path = root / "index.html"

    def _public_file_response(file_name: str, request: Request) -> FileResponse:
        return _serve_static_file(root, file_name, request)

    if assets_dir.is_dir():

        @app.api_route("/assets/{file_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
        async def serve_asset(file_path: str, request: Request) -> FileResponse:
            """Serve a build asset, preferring its pre-compressed sibling."""
            if not _is_safe_relative_path(file_path):
                raise HTTPException(status_code=404, detail="Not found")
            return _serve_static_file(root, f"assets/{file_path}", request)

        logger.info(f"Serving frontend assets from: {assets_dir}")
    else:
        logger.warning(f"Assets directory not found: {assets_dir}")

    # Serve Vite public/ root assets (favicon, PWA manifest, touch icons) before
    # the SPA catch-all. Without this, /favicon.svg returns index.html.
    @app.api_route("/favicon.svg", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_favicon_svg(request: Request) -> FileResponse:
        return _public_file_response("favicon.svg", request)

    @app.api_route("/apple-touch-icon.png", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_apple_touch_icon(request: Request) -> FileResponse:
        return _public_file_response("apple-touch-icon.png", request)

    @app.api_route("/site.webmanifest", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_site_webmanifest(request: Request) -> FileResponse:
        return _public_file_response("site.webmanifest", request)

    @app.api_route("/icon-192.png", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_icon_192(request: Request) -> FileResponse:
        return _public_file_response("icon-192.png", request)

    @app.api_route("/icon-512.png", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_icon_512(request: Request) -> FileResponse:
        return _public_file_response("icon-512.png", request)

    @app.api_route("/sw.js", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_service_worker(request: Request) -> FileResponse:
        return _public_file_response("sw.js", request)

    # The guest page of a share link (calvin-mwqo) links its own PWA manifest,
    # so "Add to Home screen" installs this link and Android's Share menu offers
    # it. The page itself is the SPA; a dead token is explained there.
    @app.get("/share/{token}", include_in_schema=False)
    @app.get("/share/{token}/", include_in_schema=False)
    async def serve_share_page(token: str) -> HTMLResponse:
        from app.api.routes.share import share_page_html

        if not index_path.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return HTMLResponse(
            share_page_html(index_path.read_text(encoding="utf-8"), token),
            headers={
                "Cache-Control": "no-store",
                "Referrer-Policy": "no-referrer",
            },
        )

    # Serve index.html for root path
    @app.get("/", operation_id="root__get", summary="Root")
    async def serve_frontend_root(request: Request):
        """Root endpoint."""
        if index_path.is_file():
            return _static_response(index_path, request, "index.html", root)
        return {"message": "Calvin Dashboard API", "version": __version__}

    # Serve index.html for all other non-API routes (SPA routing)
    # This must come after API routes and asset mounts to avoid intercepting them
    # Only handle GET requests for SPA routing - POST requests should only go to API routes
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend_get(full_path: str, request: Request):
        """Serve frontend index.html for SPA routing (GET only)."""
        # Don't handle API routes, docs, or assets (already handled by mounts/routers)
        if (
            full_path.startswith("api/")
            or full_path.startswith("docs")
            or full_path.startswith("openapi.json")
            or full_path.startswith("assets/")
            or full_path.lower().endswith(_COMPRESSED_SUFFIXES)
        ):
            # Return 404 for API routes that don't exist (let routers handle it)
            raise HTTPException(status_code=404, detail="Not found")

        if index_path.is_file():
            return _static_response(index_path, request, "index.html", root)
        return {"message": "Calvin Dashboard API", "version": __version__}
