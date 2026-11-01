"""Guest uploads are re-encoded: images only, resized, GPS stripped (calvin-mwqo)."""

from io import BytesIO

import pytest
from fastapi import HTTPException
from PIL import Image

from app.services.guest_image import MAX_EDGE, MAX_GUEST_UPLOAD_BYTES, prepare_guest_image
from tests.test_utils import create_test_image

GPS_IFD = 0x8825
MAKE = 0x010F
ORIENTATION = 0x0112


def _jpeg_with_exif(width=64, height=32, orientation=1) -> bytes:
    img = Image.new("RGB", (width, height), (10, 200, 30))
    exif = Image.Exif()
    exif[MAKE] = "PhoneCo"
    exif[ORIENTATION] = orientation
    exif.get_ifd(GPS_IFD)[2] = (59.0, 20.0, 0.0)  # GPSLatitude
    buffer = BytesIO()
    img.save(buffer, "JPEG", exif=exif)
    return buffer.getvalue()


def _open(data: bytes) -> Image.Image:
    return Image.open(BytesIO(data))


def test_jpeg_keeps_exif_but_drops_gps():
    source = _jpeg_with_exif()
    assert _open(source).getexif().get_ifd(GPS_IFD)  # precondition

    data, name = prepare_guest_image(source, "IMG_1.jpg")

    out = _open(data)
    assert out.format == "JPEG"
    assert name == "IMG_1.jpg"
    exif = out.getexif()
    assert not exif.get_ifd(GPS_IFD)
    assert GPS_IFD not in exif
    assert exif.get(MAKE) == "PhoneCo"


def test_orientation_is_applied_and_reset():
    # Orientation 6 = rotate 90° clockwise to display.
    data, _ = prepare_guest_image(_jpeg_with_exif(64, 32, orientation=6), "a.jpg")

    out = _open(data)
    assert out.size == (32, 64)
    assert out.getexif().get(ORIENTATION, 1) == 1


def test_large_photo_is_resized_for_display():
    source = create_test_image("JPEG", width=MAX_EDGE * 2, height=MAX_EDGE)

    data, _ = prepare_guest_image(source, "big.jpg")

    assert max(_open(data).size) == MAX_EDGE


def test_real_format_decides_the_extension():
    data, name = prepare_guest_image(create_test_image("PNG"), "photo.jpg")

    assert name == "photo.png"
    assert _open(data).format == "PNG"


def test_filename_is_reduced_to_a_safe_stem():
    _, name = prepare_guest_image(create_test_image("JPEG"), "../../etc/pass wd.jpeg")

    assert name == "pass wd.jpg"


def _gif(frames: int = 3, size=(8, 8), trailer: bytes = b"") -> bytes:
    images = [Image.new("RGB", size, (i * 80 % 256, 0, 0)) for i in range(frames)]
    buffer = BytesIO()
    images[0].save(buffer, "GIF", save_all=True, append_images=images[1:], duration=120, loop=0)
    return buffer.getvalue() + trailer


def test_animated_gif_is_re_encoded_with_its_frames():
    source = _gif(3)

    data, name = prepare_guest_image(source, "fun.gif")

    out = _open(data)
    assert name == "fun.gif"
    assert out.format == "GIF"
    assert out.is_animated and out.n_frames == 3
    assert out.info.get("loop") == 0


def test_animated_gif_drops_bytes_after_the_trailer():
    trailer = b"<script>alert(1)</script>"

    data, _ = prepare_guest_image(_gif(3, trailer=trailer), "fun.gif")

    assert trailer not in data
    assert data.endswith(b"\x3b")  # the GIF trailer byte


def test_animated_gif_long_edge_is_capped():
    from app.services.guest_image import MAX_ANIMATED_EDGE

    data, _ = prepare_guest_image(_gif(2, size=(MAX_ANIMATED_EDGE * 2, 40)), "wide.gif")

    out = _open(data)
    assert out.n_frames == 2
    assert max(out.size) == MAX_ANIMATED_EDGE


def test_animated_gif_with_too_many_frames_is_refused():
    from app.services.guest_image import MAX_GIF_FRAMES

    with pytest.raises(HTTPException) as exc:
        prepare_guest_image(_gif(MAX_GIF_FRAMES + 1, size=(4, 4)), "long.gif")
    assert exc.value.status_code == 400


def test_animated_gif_over_the_pixel_budget_is_refused(monkeypatch):
    import app.services.guest_image as guest_image

    # Every frame counts: 3 frames of 100x100 is 30 000 pixels to decode.
    monkeypatch.setattr(guest_image, "MAX_PIXELS", 25_000)
    with pytest.raises(HTTPException) as exc:
        prepare_guest_image(_gif(3, size=(100, 100)), "big.gif")
    assert exc.value.status_code == 400


@pytest.mark.parametrize(
    "payload, filename",
    [
        (b"not an image at all", "evil.jpg"),
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "x.svg"),
        (b"%PDF-1.4", "doc.pdf"),
    ],
)
def test_non_images_are_refused(payload, filename):
    with pytest.raises(HTTPException) as exc:
        prepare_guest_image(payload, filename)
    assert exc.value.status_code == 400


def test_unsupported_real_format_is_refused():
    buffer = BytesIO()
    Image.new("RGB", (8, 8)).save(buffer, "BMP")

    with pytest.raises(HTTPException):
        prepare_guest_image(buffer.getvalue(), "x.jpg")


def test_too_large_is_refused():
    with pytest.raises(HTTPException) as exc:
        prepare_guest_image(b"\0" * (MAX_GUEST_UPLOAD_BYTES + 1), "big.jpg")
    assert exc.value.status_code == 400
