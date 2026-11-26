#!/usr/bin/env bash
# calvin-drm-hold.py: holds DRM master with every CRTC disabled while the screen
# is off (calvin-e8ze). libdrm is replaced by a fake that records the calls and
# the "cards" are plain files in a temp dir: no real DRM device is opened.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"
HELPER="$REPO/deploy/kiosk-agent/calvin-drm-hold.py"
[ -f "$HELPER" ] || fail "calvin-drm-hold.py is missing"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

PYTHONDONTWRITEBYTECODE=1 timeout 30 python3 - "$HELPER" "$tmp" <<'PY' || fail "holder checks failed"
import ctypes, importlib.util, os, signal, socket, subprocess, sys, textwrap

helper, tmp = sys.argv[1:3]
spec = importlib.util.spec_from_file_location("drm_hold", helper)
hold = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hold)


class FakeDrm:
    """cards: name -> CRTC ids, or None for a render-only card (v3d)."""

    def __init__(self, cards, master=0, disable=0):
        self.cards, self.master, self.disable = cards, master, disable
        self.calls, self.freed, self.keep = [], 0, []

    def name(self, fd):
        return os.path.basename(os.readlink(f"/proc/self/fd/{fd}"))

    def drmModeGetResources(self, fd):
        ids = self.cards[self.name(fd)]
        if ids is None:
            return ctypes.POINTER(hold.DrmModeRes)()
        array = (ctypes.c_uint32 * len(ids))(*ids)
        res = hold.DrmModeRes(count_crtcs=len(ids), crtcs=array)
        self.keep += [array, res]
        return ctypes.pointer(res)

    def drmModeFreeResources(self, res):
        self.freed += 1

    def drmSetMaster(self, fd):
        self.calls.append(("master", self.name(fd)))
        return self.master

    def drmModeSetCrtc(self, fd, crtc, fb, x, y, connectors, count, mode):
        self.calls.append(("disable", self.name(fd), crtc, fb, connectors, count, mode))
        return self.disable


def dri(*names):
    path = os.path.join(tmp, "-".join(names) or "empty")
    os.makedirs(path, exist_ok=True)
    for name in names:
        open(os.path.join(path, name), "w").close()
    return path


def is_open(fd):
    try:
        os.fstat(fd)
        return True
    except OSError:
        return False


# Pi 400 layout: card0 is the render-only v3d, card1 drives the display.
fake = FakeDrm({"card0": None, "card1": [31, 47]})
fds = hold.hold_cards(fake, dri("card0", "card1"))
assert len(fds) == 1 and is_open(fds[0]), "the display card is not kept open"
assert fake.name(fds[0]) == "card1"
assert fake.calls == [
    ("master", "card1"),
    ("disable", "card1", 31, 0, None, 0, None),
    ("disable", "card1", 47, 0, None, 0, None),
], fake.calls
assert fake.freed == 1, "the resources were not freed"
os.close(fds[0])

# 3B+ layout: the display is card0.
fake = FakeDrm({"card0": [31]})
fds = hold.hold_cards(fake, dri("card0"))
assert [fake.name(fd) for fd in fds] == ["card0"]
os.close(fds[0])


def refused(fake, path, text):
    before = set(os.listdir("/proc/self/fd"))
    try:
        hold.hold_cards(fake, path)
    except hold.HoldError as exc:
        assert text in str(exc), exc
    else:
        raise AssertionError(f"expected HoldError containing {text!r}")
    assert set(os.listdir("/proc/self/fd")) == before, "a refused hold leaked a card fd"


# Someone else still holds master: nothing may be disabled, nothing claimed.
fake = FakeDrm({"card0": [31]}, master=-1)
refused(fake, dri("card0"), "DRM master")
assert not [c for c in fake.calls if c[0] == "disable"]
refused(FakeDrm({"card0": [31]}, disable=-22), dri("card0"), "CRTC 31")
refused(FakeDrm({"card0": None}), dri("card0"), "no display card")
refused(FakeDrm({}), dri(), "no display card")

# The process: reports READY to systemd once held, sleeps, exits 0 on SIGTERM.
sock_path = os.path.join(tmp, "notify.sock")
sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
sock.bind(sock_path)
sock.settimeout(10)
driver = textwrap.dedent("""
    import importlib.util, os, sys
    spec = importlib.util.spec_from_file_location("drm_hold", sys.argv[1])
    hold = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(hold)
    hold.hold_cards = lambda lib, dri_dir: [os.open(os.devnull, os.O_RDONLY)]
    hold.load_libdrm = lambda: None
    sys.exit(hold.main())
""")
proc = subprocess.Popen(
    [sys.executable, "-c", driver, helper], env=dict(os.environ, NOTIFY_SOCKET=sock_path)
)
try:
    assert sock.recv(64) == b"READY=1"
    try:
        proc.wait(timeout=0.3)
        raise AssertionError("the holder exited instead of holding the card")
    except subprocess.TimeoutExpired:
        pass
    proc.send_signal(signal.SIGTERM)
    assert proc.wait(timeout=10) == 0, "SIGTERM is not a clean exit"
finally:
    proc.kill()

# A hold that fails exits non-zero and never says READY.
failing = driver.replace(
    "lambda lib, dri_dir: [os.open(os.devnull, os.O_RDONLY)]",
    "lambda lib, dri_dir: (_ for _ in ()).throw(hold.HoldError('busy'))",
)
done = subprocess.run(
    [sys.executable, "-c", failing, helper],
    env=dict(os.environ, NOTIFY_SOCKET=sock_path), capture_output=True, text=True, timeout=10,
)
assert done.returncode == 1 and "busy" in done.stderr, done
sock.setblocking(False)
try:
    raise AssertionError(f"a failed hold notified systemd: {sock.recv(64)!r}")
except BlockingIOError:
    pass
PY
pass "the holder takes master, disables every CRTC, reports ready and exits cleanly"

echo "PASS"
