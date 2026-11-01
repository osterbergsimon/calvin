"""Share links: let guests add photos to one Local photos folder (calvin-mwqo).

Admin routes (``/api/share/*``) create, list, rename and revoke links; they are
ordinary admin routes under the route policy (the listing is an admin read,
since it carries each link's URL). Guest routes (``/api/guest/{token}/*`` and
the Web Share Target action ``/share/{token}/receive``) are in
:data:`~app.security.route_policy.GUEST_ROUTES`: the policy resolves the token
to ``request.state.share_link`` before a handler runs, and these handlers only
ever act on that link's own folder and uploads.

A guest's phone is told apart by the random ``calvin_guest`` cookie (only its
hash is stored), so a guest sees and removes only the photos sent from that
phone.
"""

import math
import re
import secrets
import time
from collections import deque
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from loguru import logger
from pydantic import BaseModel, Field

from app.security.admin_auth import guest_token_limiter
from app.security.share_links import (
    MAX_NAME_LEN,
    DuplicateLinkName,
    InvalidFolder,
    get_share_link_store,
)
from app.services.guest_image import MAX_GUEST_UPLOAD_BYTES, prepare_guest_image

__all__ = ["guest_token_limiter", "guest_upload_limiter", "router", "share_target_router"]

router = APIRouter()
# Mounted without the /api prefix: the share target action must sit inside the
# guest PWA's scope (/share/{token}/).
share_target_router = APIRouter()

DEVICE_COOKIE = "calvin_guest"
DEVICE_COOKIE_MAX_AGE = 34560000  # 400 days, the browser cap
MAX_FILES_PER_REQUEST = 50
MAX_EXPIRY_DAYS = 365
ACCEPT = ["image/*", ".jpg", ".jpeg", ".png", ".webp", ".gif"]


class UploadRateLimiter:
    """At most ``max_events`` photos per ``window`` seconds per key (link + IP)."""

    def __init__(self, max_events: int = 100, window: int = 600):
        self.max_events = max_events
        self.window = window
        self._events: dict[str, deque[float]] = {}

    def reset(self) -> None:
        self._events.clear()

    def check(self, key: str, now: float | None = None) -> int:
        """0 when allowed, else the whole seconds until the oldest event expires."""
        current = time.time() if now is None else now
        events = self._events.setdefault(key, deque())
        while events and current - events[0] >= self.window:
            events.popleft()
        if len(events) < self.max_events:
            return 0
        return max(1, math.ceil(events[0] + self.window - current))

    def record(self, key: str, now: float | None = None) -> None:
        self._events.setdefault(key, deque()).append(time.time() if now is None else now)


guest_upload_limiter = UploadRateLimiter()


# -- helpers -----------------------------------------------------------------


def _local_photos():
    """The Local photos plugin when it is installed and on, else ``None``."""
    from app.plugins.image.local import LocalImagePlugin
    from app.plugins.manager import plugin_manager
    from app.services.plugin_image_service import LOCAL_PHOTOS_ID

    plugin = plugin_manager.get_plugin(LOCAL_PHOTOS_ID)
    if isinstance(plugin, LocalImagePlugin) and plugin.enabled:
        return plugin
    return None


def _local_photos_off() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={
            "code": "local_photos_off",
            "message": "Calvin can't take photos right now. Ask the owner to turn on Local photos.",
        },
    )


def _with_path(link: dict[str, Any]) -> dict[str, Any]:
    token = get_share_link_store().token_for(link["id"])
    return {**link, "path": f"/share/{token}/" if token else None}


def _link_not_found() -> HTTPException:
    return HTTPException(
        status_code=404, detail={"code": "share_link_not_found", "message": "No such link."}
    )


def _device(request: Request) -> tuple[str, bool]:
    """This phone's device id, and whether it is new (and must be set as a cookie)."""
    value = request.cookies.get(DEVICE_COOKIE, "")
    if 16 <= len(value) <= 64 and value.replace("-", "").replace("_", "").isalnum():
        return value, False
    return secrets.token_urlsafe(24), True


def _set_device(response: Response, device: str) -> None:
    response.set_cookie(
        DEVICE_COOKIE,
        device,
        max_age=DEVICE_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )


def _guest_link(request: Request) -> dict[str, Any]:
    # Set by the route policy for every GUEST_ROUTES request.
    link: dict[str, Any] = request.state.share_link
    return link


def _upload_view(token: str, upload: dict[str, Any]) -> dict[str, Any]:
    return {
        "imageId": upload["imageId"],
        "uploadedAt": upload["uploadedAt"],
        "thumbnail": f"/api/guest/{token}/uploads/{upload['imageId']}/thumbnail",
    }


async def _save_files(
    request: Request, link: dict[str, Any], device: str, files: list[UploadFile]
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Store each photo in the link's folder. Returns ``(uploaded, failed)``."""
    from app.services import plugin_image_service

    plugin = _local_photos()
    if plugin is None:
        raise _local_photos_off()
    ip = request.client.host if request.client else "unknown"
    limit_key = f"{link['id']}:{ip}"
    wait = guest_upload_limiter.check(limit_key)
    if wait:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "rate_limited",
                "message": f"That's a lot of photos at once. Try again in {wait} seconds.",
                "retry_after": wait,
            },
            headers={"Retry-After": str(wait)},
        )
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "too_many_files",
                "message": f"Send at most {MAX_FILES_PER_REQUEST} photos at a time.",
            },
        )

    store = get_share_link_store()
    token = str(request.path_params["token"])
    uploaded: list[dict[str, Any]] = []
    failed: list[dict[str, str]] = []
    for file in files:
        filename = file.filename or "photo"
        data = await file.read(MAX_GUEST_UPLOAD_BYTES + 1)
        try:
            prepared, name = prepare_guest_image(data, filename)
        except HTTPException as exc:
            failed.append({"filename": filename, "message": str(exc.detail)})
            continue
        if guest_upload_limiter.check(limit_key):
            failed.append({"filename": filename, "message": "Too many photos. Try again later."})
            continue
        image = await plugin_image_service.upload_to_local_folder(prepared, name, link["folder"])
        if not image:
            failed.append({"filename": filename, "message": "Couldn't save this photo."})
            continue
        guest_upload_limiter.record(limit_key)
        relative = Path(image["path"]).relative_to(plugin.image_dir).as_posix()
        store.record_upload(link["id"], relative, image["id"], device)
        uploaded.append(
            _upload_view(
                token,
                {"imageId": image["id"], "uploadedAt": datetime.now(UTC).isoformat()},
            )
        )
    if uploaded:
        logger.info(
            "Share link {} ({}): {} photo(s) added", link["id"], link["name"], len(uploaded)
        )
    return uploaded, failed


_TOKEN_CHARS = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


def share_page_html(index_html: str, token: str) -> str:
    """The SPA's ``index.html`` for a guest page: its own manifest and home-screen name."""
    if not _TOKEN_CHARS.match(token):
        return index_html
    manifest = f"/api/guest/{token}/manifest.webmanifest"
    html = index_html.replace('href="/site.webmanifest"', f'href="{manifest}"')
    extra = (
        '<meta name="apple-mobile-web-app-capable" content="yes">'
        '<meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-title" content="Calvin photos">'
    )
    html = html.replace("</head>", f"{extra}</head>", 1)
    return re.sub(r"<title>[^<]*</title>", "<title>Add photos</title>", html, count=1)


# -- admin -------------------------------------------------------------------


class CreateLinkBody(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_NAME_LEN)
    folder: str = Field(min_length=1)
    expires_in_days: int | None = Field(default=None, ge=1, le=MAX_EXPIRY_DAYS)


class RenameLinkBody(BaseModel):
    name: str = Field(min_length=1, max_length=MAX_NAME_LEN)


def _clean_name(raw: str) -> str:
    name = raw.strip()
    if not name:
        raise HTTPException(
            status_code=422, detail={"code": "name_required", "message": "Give the link a name."}
        )
    return name


def _duplicate(name: str) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={"code": "duplicate_name", "message": f"You already have a link called {name}."},
    )


@router.get("/share/links")
async def list_share_links():
    """Every link, newest first, with its guest URL path (admin read)."""
    return {"links": [_with_path(link) for link in get_share_link_store().list()]}


@router.get("/share/folders")
async def list_share_folders():
    """Existing Local photos subfolders, to pick a link's folder from."""
    plugin = _local_photos()
    return {"folders": plugin.list_folders() if plugin else []}


@router.post("/share/links", status_code=201)
async def create_share_link(body: CreateLinkBody):
    name = _clean_name(body.name)
    expires_at = None
    if body.expires_in_days is not None:
        expires_at = (datetime.now(UTC) + timedelta(days=body.expires_in_days)).timestamp()
    try:
        link, _token = get_share_link_store().create(name, body.folder, expires_at=expires_at)
    except DuplicateLinkName:
        raise _duplicate(name) from None
    except InvalidFolder:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_folder",
                "message": "Use letters, numbers, spaces, - or _ for the folder name.",
            },
        ) from None
    logger.info("Share link created: {} ({}) -> {}", link["id"], link["name"], link["folder"])
    return {"link": _with_path(link)}


@router.patch("/share/links/{link_id}")
async def rename_share_link(link_id: str, body: RenameLinkBody):
    name = _clean_name(body.name)
    try:
        link = get_share_link_store().rename(link_id, name)
    except DuplicateLinkName:
        raise _duplicate(name) from None
    if link is None:
        raise _link_not_found()
    return {"link": _with_path(link)}


@router.delete("/share/links/{link_id}", status_code=204)
async def revoke_share_link(link_id: str, remove_photos: bool = False):
    """Revoke at once; optionally delete the photos guests sent through it."""
    from app.services import plugin_image_service

    revoked = get_share_link_store().revoke(link_id)
    if revoked is None:
        raise _link_not_found()
    removed = 0
    if remove_photos:
        for upload in revoked["uploads"]:
            if await plugin_image_service.delete_image(upload["imageId"]):
                removed += 1
    logger.info(
        "Share link revoked: {} ({}), {} photo(s) removed", link_id, revoked["name"], removed
    )
    return Response(status_code=204)


# -- guest -------------------------------------------------------------------


@router.get("/guest/{token}")
async def guest_info(token: str, request: Request, response: Response):
    """What the guest page shows: the link's name and the upload limits."""
    link = _guest_link(request)
    device, new = _device(request)
    if new:
        _set_device(response, device)
    get_share_link_store().touch(link["id"])
    return {
        "name": link["name"],
        "expiresAt": link["expiresAt"],
        "maxBytes": MAX_GUEST_UPLOAD_BYTES,
        "maxFiles": MAX_FILES_PER_REQUEST,
        "available": _local_photos() is not None,
    }


@router.get("/guest/{token}/manifest.webmanifest")
async def guest_manifest(token: str, request: Request):
    """Per-link PWA manifest: installable, and an Android share target."""
    base = f"/share/{token}/"
    manifest = {
        "id": base,
        "name": "Add photos to Calvin",
        "short_name": "Calvin photos",
        "description": f"Send photos to {_guest_link(request)['name']} on Calvin.",
        "start_url": base,
        "scope": base,
        "display": "standalone",
        "background_color": "#0e1316",
        "theme_color": "#0e1316",
        "icons": [
            {"src": "/icon-192.png", "type": "image/png", "sizes": "192x192"},
            {"src": "/icon-512.png", "type": "image/png", "sizes": "512x512"},
            {
                "src": "/icon-512.png",
                "type": "image/png",
                "sizes": "512x512",
                "purpose": "maskable",
            },
        ],
        "share_target": {
            "action": f"{base}receive",
            "method": "POST",
            "enctype": "multipart/form-data",
            "params": {"files": [{"name": "photos", "accept": ACCEPT}]},
        },
    }
    return JSONResponse(
        manifest,
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/guest/{token}/uploads")
async def guest_uploads(token: str, request: Request):
    """Photos sent from this phone through this link, newest first."""
    link = _guest_link(request)
    device, _ = _device(request)
    plugin = _local_photos()
    uploads = get_share_link_store().uploads_for(link["id"], device)
    if plugin is not None:
        uploads = [u for u in uploads if (plugin.image_dir / u["path"]).is_file()]
    return {"uploads": [_upload_view(token, upload) for upload in uploads]}


@router.post("/guest/{token}/uploads")
async def guest_upload(
    token: str,
    request: Request,
    response: Response,
    photos: list[UploadFile] = File(...),
):
    link = _guest_link(request)
    device, new = _device(request)
    uploaded, failed = await _save_files(request, link, device, photos)
    if not uploaded:
        message = failed[0]["message"] if failed else "No photos received."
        raise HTTPException(
            status_code=400,
            detail={"code": "upload_failed", "message": message, "failed": failed},
        )
    if new:
        _set_device(response, device)
    return {"uploaded": uploaded, "failed": failed}


def _own_upload(request: Request, image_id: str) -> dict[str, Any]:
    link = _guest_link(request)
    device, _ = _device(request)
    for upload in get_share_link_store().uploads_for(link["id"], device):
        if upload["imageId"] == image_id:
            return upload
    raise HTTPException(
        status_code=404,
        detail={"code": "upload_not_found", "message": "That photo isn't one of yours."},
    )


@router.delete("/guest/{token}/uploads/{image_id}", status_code=204)
async def guest_remove_upload(token: str, image_id: str, request: Request):
    """Remove one of this phone's own uploads (file and record)."""
    from app.services import plugin_image_service

    _own_upload(request, image_id)
    link = _guest_link(request)
    device, _ = _device(request)
    await plugin_image_service.delete_image(image_id)
    get_share_link_store().remove_upload(link["id"], image_id, device)
    return Response(status_code=204)


@router.get("/guest/{token}/uploads/{image_id}/thumbnail")
async def guest_thumbnail(token: str, image_id: str, request: Request):
    _own_upload(request, image_id)
    plugin = _local_photos()
    path = plugin.get_thumbnail_path(image_id) if plugin else None
    if path is None:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private"})


@share_target_router.post("/share/{token}/receive", include_in_schema=False)
async def share_target(
    token: str,
    request: Request,
    photos: list[UploadFile] = File(default=[]),
):
    """Web Share Target action: Android's Share → Calvin lands here."""
    link = _guest_link(request)
    device, new = _device(request)
    try:
        uploaded, failed = await _save_files(request, link, device, photos)
        query = f"added={len(uploaded)}&failed={len(failed)}"
    except HTTPException as exc:
        code = exc.detail.get("code") if isinstance(exc.detail, dict) else "upload_failed"
        query = f"error={code}"
    redirect = RedirectResponse(f"/share/{token}/?{query}", status_code=303)
    if new:
        _set_device(redirect, device)
    return redirect
