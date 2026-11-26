#!/usr/bin/env python3
"""Hold DRM master with every CRTC off while the cog kiosk's screen is off.

With cog stopped nobody owns the display card. A monitor that pulses hotplug on
entering standby then makes the kernel's fbdev client re-apply its mode, and the
panel lights up black (calvin-e8ze). The kernel does not do that while a
userspace DRM master exists, so this process becomes one, disables the CRTCs and
sleeps. calvin-cog-panel.sh starts it (calvin-drm-hold.service) after cog has
stopped and stops it before cog starts: closing the card drops master, and the
kernel restores the console mode that cog needs.

Never run it by hand on a desktop: it turns the screen off.
"""

import ctypes
import glob
import os
import signal
import socket
import sys

DRI_DIR = "/dev/dri"


class DrmModeRes(ctypes.Structure):
    """drmModeRes from libdrm's xf86drmMode.h."""

    _fields_ = [
        ("count_fbs", ctypes.c_int),
        ("fbs", ctypes.POINTER(ctypes.c_uint32)),
        ("count_crtcs", ctypes.c_int),
        ("crtcs", ctypes.POINTER(ctypes.c_uint32)),
        ("count_connectors", ctypes.c_int),
        ("connectors", ctypes.POINTER(ctypes.c_uint32)),
        ("count_encoders", ctypes.c_int),
        ("encoders", ctypes.POINTER(ctypes.c_uint32)),
        ("min_width", ctypes.c_uint32),
        ("max_width", ctypes.c_uint32),
        ("min_height", ctypes.c_uint32),
        ("max_height", ctypes.c_uint32),
    ]


class HoldError(Exception):
    pass


def log(message):
    print(f"[calvin-drm-hold] {message}", file=sys.stderr, flush=True)


def load_libdrm():
    lib = ctypes.CDLL("libdrm.so.2", use_errno=True)
    u32, u32_p = ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32)
    lib.drmModeGetResources.argtypes = [ctypes.c_int]
    lib.drmModeGetResources.restype = ctypes.POINTER(DrmModeRes)
    lib.drmModeFreeResources.argtypes = [ctypes.POINTER(DrmModeRes)]
    lib.drmModeFreeResources.restype = None
    lib.drmSetMaster.argtypes = [ctypes.c_int]
    # fd, crtc, framebuffer, x, y, connectors, connector count, mode
    lib.drmModeSetCrtc.argtypes = [
        ctypes.c_int, u32, u32, u32, u32, u32_p, ctypes.c_int, ctypes.c_void_p,
    ]  # fmt: skip
    return lib


def crtc_ids(lib, fd):
    """The card's CRTC ids; empty for a render-only card (v3d on a Pi 4/400)."""
    res = lib.drmModeGetResources(fd)
    if not res:
        return []
    try:
        return [res.contents.crtcs[i] for i in range(res.contents.count_crtcs)]
    finally:
        lib.drmModeFreeResources(res)


def hold_card(lib, fd, path):
    """Take master on one card and disable its CRTCs. False: not a display card."""
    crtcs = crtc_ids(lib, fd)
    if not crtcs:
        return False
    # Succeeds at once when opening the card already made us master.
    if lib.drmSetMaster(fd) != 0:
        raise HoldError(f"cannot take DRM master on {path} (is a display server running?)")
    for crtc in crtcs:
        # No framebuffer, no connectors, no mode: the CRTC is switched off.
        if lib.drmModeSetCrtc(fd, crtc, 0, 0, 0, None, 0, None) != 0:
            raise HoldError(f"cannot disable CRTC {crtc} on {path}")
    log(f"holding DRM master on {path} with CRTCs {crtcs} off")
    return True


def hold_cards(lib, dri_dir):
    """Hold every display card; the returned fds must stay open while off.

    Card numbers differ between boards (card0 on a 3B+, card1 on a Pi 400).
    """
    held = []
    try:
        for path in sorted(glob.glob(os.path.join(dri_dir, "card*"))):
            fd = os.open(path, os.O_RDWR | os.O_CLOEXEC)
            keep = False
            try:
                keep = hold_card(lib, fd, path)
            finally:
                if keep:
                    held.append(fd)
                else:
                    os.close(fd)
        if not held:
            raise HoldError(f"no display card under {dri_dir}")
    except BaseException:
        for fd in held:
            os.close(fd)
        raise
    return held


def notify_ready():
    """sd_notify(READY=1): `systemctl start` returns once the screen is held off."""
    address = os.environ.get("NOTIFY_SOCKET")
    if not address:
        return
    if address.startswith("@"):
        address = "\0" + address[1:]  # abstract namespace
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as sock:
        sock.sendto(b"READY=1", address)


def main():
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        hold_cards(load_libdrm(), os.environ.get("CALVIN_DRI_DIR", DRI_DIR))
    except (HoldError, OSError) as exc:
        log(f"ERROR: {exc}")
        return 1
    notify_ready()
    while True:
        signal.pause()  # exiting closes the cards, which drops master


if __name__ == "__main__":
    sys.exit(main())
