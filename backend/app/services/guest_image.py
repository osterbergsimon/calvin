"""Prepare a guest's photo for Local photos (calvin-mwqo).

Guests are untrusted, so their files are decoded and written again instead of
stored as sent: the real format (not the file name) must be one Local photos
shows, the picture is turned upright and scaled down for display, and the GPS
block of its EXIF is dropped (camera make, date and the like are kept).
Animated GIFs are kept as sent: they carry no EXIF and re-encoding would lose
their frames.
"""

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

from app.api.routes.images import SUPPORTED_UPLOAD_FORMATS
from app.utils.errors import ErrorResponse

# Phone cameras write 5-20 MB JPEGs; everything is scaled down right after.
MAX_GUEST_UPLOAD_BYTES = 25 * 1024 * 1024
# Long edge after resizing: sharp on a 4K frame, a fraction of a camera original.
MAX_EDGE = 2560
# Refuse decompression bombs well before Pillow's own (warning-only) limit.
MAX_PIXELS = 80_000_000

_GPS_IFD = 0x8825
_ORIENTATION = 0x0112
# Pillow format name -> (extension, save format)
_FORMATS = {
    "JPEG": (".jpg", "JPEG"),
    "MPO": (".jpg", "JPEG"),  # some phones save multi-picture JPEGs
    "PNG": (".png", "PNG"),
    "WEBP": (".webp", "WEBP"),
    "GIF": (".gif", "GIF"),
}
assert {ext for ext, _ in _FORMATS.values()} <= SUPPORTED_UPLOAD_FORMATS


def _refuse(message: str):
    return ErrorResponse.validation_error("file", message)


def _safe_stem(filename: str) -> str:
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    stem = Path(name).stem.strip().lstrip(".")
    return stem[:80] or "photo"


def prepare_guest_image(data: bytes, filename: str) -> tuple[bytes, str]:
    """Return ``(bytes to store, file name)`` or raise a 400 ``HTTPException``."""
    if len(data) > MAX_GUEST_UPLOAD_BYTES:
        raise _refuse(f"File too large. Maximum size is {MAX_GUEST_UPLOAD_BYTES // 2**20}MB")
    try:
        img = Image.open(BytesIO(data))
        fmt = img.format or ""
        width, height = img.size
    except Exception:
        raise _refuse("This file isn't a photo Calvin can show.") from None
    if fmt not in _FORMATS:
        raise _refuse("Unsupported photo format. Use JPEG, PNG, WebP or GIF.")
    if width * height > MAX_PIXELS:
        raise _refuse("This photo is too large to show.")
    extension, save_format = _FORMATS[fmt]
    name = f"{_safe_stem(filename)}{extension}"

    if fmt == "GIF" and getattr(img, "is_animated", False):
        return data, name

    try:
        img.load()
        exif = img.getexif()
        upright = ImageOps.exif_transpose(img) or img
        upright.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        if _GPS_IFD in exif:
            del exif[_GPS_IFD]
        exif[_ORIENTATION] = 1
        options: dict = {}
        if save_format == "JPEG":
            if upright.mode not in ("RGB", "L"):
                upright = upright.convert("RGB")
            options = {"quality": 88, "optimize": True}
        if save_format in ("JPEG", "PNG", "WEBP"):
            options["exif"] = exif.tobytes()
        out = BytesIO()
        upright.save(out, save_format, **options)
    except Exception:
        raise _refuse("This file isn't a photo Calvin can show.") from None
    return out.getvalue(), name
