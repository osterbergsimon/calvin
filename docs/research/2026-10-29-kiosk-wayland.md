# Kiosk display stack: X11 or Wayland?

**Research date:** 2026-10-29
**Bead:** `calvin-98dq`

## Recommendation

Move the Pi 4/5 kiosks (SPLIT and FULL) to Raspberry Pi OS Trixie with **Wayland +
labwc**, and keep **X11 + openbox as the supported fallback for Pi 3B/3B+ SPLIT**
until real hardware proves that Chromium-in-a-compositor is acceptable there. Pi OS
has made Wayland/labwc the default desktop on every model, Trixie still ships an
X11 meta-package, and labwc gives us the three things Calvin's agent needs
(`wlr-output-management` for `wlr-randr` rotation, `wlr-output-power-management`
for `wlopm`, and FreeDesktop/labwc autostart) with the least distance from the
platform Raspberry Pi itself supports. Cage is the cleaner single-app compositor,
but its Pi OS build has no cursor control and no configuration, and its
headless/hotplug behaviour is a known operational hazard. Do **not** do a
flag-day switch: add a model-based dual-stack setup, make the display agent
compositor-aware, and only then flip the default for Pi 4/5. Pi 3B/3B+ stay on
X11 for now: they can run Wayland (Pi OS defaults to it), but the 1 GB RAM and
VideoCore IV GPU leave too little margin for a browser kiosk, and no credible
benchmark shows a win.

**Scope:** Calvin's kiosk browser stack (Pi OS Lite + Chromium), both SPLIT
(remote backend) and FULL (backend on the same Pi). This is a research document
only; no scripts, services, or application code were changed.

**Evidence note.** Facts are linked inline. Package versions were checked against
the Raspberry Pi Trixie archive and Debian on 2026-10-29. Forum posts and user
reports are labelled as such; anything I could not verify is marked **UNVERIFIED**.

---

## Comparison at a glance

| Option | In Pi OS Trixie? | Upstream status | Single-app start | Cursor hiding | Runtime rotation | Touch follows rotation | Fit for Calvin |
|---|---|---|---|---|---|---|---|
| **labwc** | Yes, default; `0.20.2-1~bpo13+1` in the Pi archive | Active; 0.20.2 (2026-08-21) | `~/.config/labwc/autostart` or XDG `.desktop`; can run standalone from a systemd/PAM session | `HideCursor` + `WarpCursor` actions, but one-shot (no idle auto-hide) | `wlr-randr` / `kanshi` (wlr-output-management v4) | Yes via wlroots; explicit `<touch><mapToOutput>` available | **Best overall** for Pi 4/5 |
| **cage** | Yes; `0.3.1-1~bpo13+1+rpt2` | Active; 0.3.1 (2026-06-30) | `cage -- chromium …` from a systemd unit (PAM/logind session required) | **No option** in 0.3.1; cursor shown if any pointer-capable device exists; master has a post-0.3.1 fix | `wlr-randr` / `kanshi` (wlr-output-management v4) | Expected via wlroots; needs per-panel verification | Good minimal alternative, weaker operations story |
| **sway** | Yes; `1.10.1-2+rpt1` | Active; 1.12 (2026-05-25) | `exec` in config; can run from a systemd/TTY session | `seat seat0 hide_cursor 1000` | `output … transform`; also `wlr-randr` | `input … map_to_output` | Works, but a tiling WM is more config than a kiosk needs |
| **wayfire** | Yes; `0.9.0-5+rpt1`, but Raspberry Pi **no longer supports/updates it** | Upstream active (0.11, 2026-07-27), but dropped by Pi OS | `[autostart]` in `wayfire.ini` | Plugin/config dependent; **UNVERIFIED** | wlr-output-management supported | Supported via wlroots, but stack is legacy on Pi OS | Not recommended |
| **weston** | Debian `14.0.2` (apt, not a Pi OS default) | Active upstream (16.0) | `--shell=kiosk` / `weston.ini` | Kiosk shell hides cursor in practice; no documented toggle (**UNVERIFIED**) | Config only (`[output] transform`), no wlr-output-management | Historically problematic; needs calibration (**UNVERIFIED**) | Not a fit: no wlr-output-management/power-management |

Version sources: Pi archive
[`dists/trixie/main/binary-arm64/Packages.gz`](http://archive.raspberrypi.com/debian/dists/trixie/main/binary-arm64/Packages.gz)
(queried 2026-10-29); Debian [madison](https://api.ftp-master.debian.org/madison?package=weston&table=all).
Protocol support: [wlr-output-management](https://wayland.app/protocols/wlr-output-management-unstable-v1)
and [wlr-output-power-management](https://wayland.app/protocols/wlr-output-power-management-unstable-v1)
compositor tables. Upstream dates from GitHub releases.

---

## 1. What current Raspberry Pi OS ships and defaults to

**Trixie is current; Bookworm is oldstable but still relevant.**

- Debian 13 "trixie" is the current stable release (13.7, 2026-09-12). Debian 12
  "bookworm" is oldstable, with LTS through **2028-06-30**. Trixie's own
  end-of-life is **2028-08-09**, with LTS through **2030-06-30**
  ([Debian releases](https://www.debian.org/releases/)).
- Raspberry Pi OS Trixie was announced on 2025-10-02. Raspberry Pi staff said
  Bookworm would get Debian support for another two years and new kernels for
  critical vulnerabilities, but **no further Raspberry Pi-specific package
  updates** ([Trixie announcement + staff comments](https://www.raspberrypi.com/news/trixie-the-new-version-of-raspberry-pi-os/)).
  Bookworm remains downloadable as "Legacy" and still receives Chromium builds;
  the Pi archive currently carries Chromium 156 for both Bookworm and Trixie.
- **Desktop default:** since the October 2024 Bookworm release, Raspberry Pi
  Desktop runs **Wayland with labwc by default on all models**, including Pi 3;
  X11 remains selectable, and Wayfire is no longer supported with updates
  ([labwc announcement](https://www.raspberrypi.com/news/a-new-release-of-raspberry-pi-os/)).
  Trixie continues the labwc default. On Bookworm before that update, Pi 4/5 used
  Wayfire/Wayland and Pi 3 used X11.
- **Lite:** Raspberry Pi OS Lite is command-line only; it ships **no display
  server and no compositor**. Trixie splits the desktop into meta-packages:
  `rpd-wayland-core` for a bare Wayland desktop, `rpd-x-core` for a bare X11
  desktop, plus `rpd-theme`, `rpd-preferences`, etc.
  ([Trixie announcement](https://www.raspberrypi.com/news/trixie-the-new-version-of-raspberry-pi-os/)).
  Both meta-packages are present in the Trixie archive at version `1.35`.
- **Is X11 still supported on Lite?** Yes. Installing `rpd-x-core` (or just
  `xserver-xorg`/`xinit`/`openbox`) gives a supported X11 kiosk, and
  `raspi-config` still exposes an X11 session. **UNVERIFIED:** Raspberry Pi has
  not published a date on which X11 will be removed. The practical horizon is the
  Trixie support window (Debian security to 2028, LTS to 2030); do not assume X11
  survives beyond that, but there is no announced near-term cutoff.

**Per model, in practice:**

| Model | Pi OS Trixie Desktop default | Lite: what you install | Notes for Calvin |
|---|---|---|---|
| Pi 5 / Pi 500 / CM5 | Wayland + labwc | `rpd-wayland-core` + Chromium | Best Wayland target; Pi 5 has no H.264 decoder (see §5) |
| Pi 4B / Pi 400 / CM4 | Wayland + labwc | same | Recommended Wayland target; 2 GB+ |
| Pi 3B / 3B+ / 3A+ | Wayland + labwc | same | 1 GB (3A+ 512 MB); Chromium is the bottleneck, not the compositor |
| Pi Zero 2 W / older | Wayland + labwc on Desktop | same | 512 MB; not recommended for Chromium (Calvin already says this) |

The X11 option is still present on Trixie; Raspberry Pi's own current kiosk
tutorial uses the **Desktop** image and labwc's `~/.config/labwc/autostart`
([Raspberry Pi kiosk tutorial](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/)).
That is a strong signal that Wayland/labwc is now the supported path, while X11 is
compatibility, not the future.

---

## 2. Candidate compositors for a single-app kiosk

### labwc

- **Packaged:** yes, default. Pi archive Trixie: `0.20.2-1~bpo13+1`; Bookworm:
  `0.8.4-1+rpt1`. Debian stable has 0.8.3, so Pi OS deliberately ships a newer
  backport.
- **Maintenance:** active; 0.20.2 released 2026-08-21, developed closely with
  Raspberry Pi and wlroots.
- **Autostart without a desktop:** yes. `~/.config/labwc/autostart` (shell script)
  or a FreeDesktop `.desktop` file in `/etc/xdg/autostart`; Raspberry Pi's kiosk
  tutorial uses the former. labwc can be started directly as the session process;
  it does not require LXDE or a login manager.
- **Cursor:** `HideCursor` and `WarpCursor` actions exist, but there is no
  persistent "hide after idle" setting. piSignage documents the workaround:
  bind `HideCursor` + `WarpCursor x=-1 y=-1`, then fire it at startup with
  `wtype` ([labwc actions](https://labwc.github.io/labwc-actions.5.html),
  [piSignage cursor guide](https://help.pisignage.com/hc/en-us/articles/59094755442201-Hiding-the-Mouse-Cursor-on-the-labwc-Wayland-Player)).
  The cursor reappears on pointer/touch input.
- **Rotation:** `wlr-randr` or `kanshi`; labwc implements
  wlr-output-management v4. labwc's own integration guide recommends
  `wlr-randr` for one-shot output changes and `kanshi` for profiles
  ([labwc integration](https://labwc.github.io/integration.html)).
- **Touch mapping:** wlroots maps touch to the output under the touch point and
  applies the output transform. labwc additionally exposes
  `<touch><mapToOutput>HDMI-A-1</mapToOutput>` and per-device `<libinput>`
  settings in `rc.xml` ([rc.xml reference](https://github.com/labwc/labwc/blob/master/docs/rc.xml.all)).
  There is a known stylus-specific rotation bug, while finger touch rotates
  correctly ([labwc #1990](https://github.com/labwc/labwc/issues/1990)); test the
  actual panel.

### cage

- **Packaged:** yes. Pi archive Trixie: `0.3.1-1~bpo13+1+rpt2`; Bookworm:
  `0.2.0-2+rpt1`.
- **Maintenance:** active but small; 0.3.1 released 2026-06-30. Cage is purpose
  built for one maximized application, with no configuration file: everything is
  command-line or environment
  ([cage configuration wiki](https://github.com/cage-kiosk/cage/wiki/Configuration),
  [cage(1)](https://man.archlinux.org/man/cage.1.en)).
- **Autostart without a desktop:** yes, but it needs a proper logind/PAM session
  (wlroots must be built with systemd-logind support). The upstream wiki has a
  `cage@.service` template with `PAMName`, `TTYPath`, and `pam_systemd`
  ([cage systemd guide](https://github.com/cage-kiosk/cage/wiki/Starting-Cage-on-boot-with-systemd)).
  This is very close to Calvin's existing `calvin-x.service` shape.
- **Cursor:** **no supported option in 0.3.1.** If any input device has pointer
  capability, cage shows a cursor. On a Pi, `vc4-hdmi` itself can register as a
  keyboard+pointer device, which is why a cursor appears in the middle of the
  screen even with no mouse. Workarounds are a transparent cursor theme, udev
  rules to ignore the device, or patching. Cage master gained a cursor-shape fix
  and "drop set_cursor when pointer capability is absent" in 2026, after 0.3.1
  ([cage #299](https://github.com/cage-kiosk/cage/issues/299)). For a product
  kiosk this is a real drawback.
- **Rotation:** `wlr-randr`/`kanshi`; cage supports wlr-output-management v4
  ([cage configuration wiki](https://github.com/cage-kiosk/cage/wiki/Configuration)).
- **Touch mapping:** wlroots default mapping follows the output layout/transform;
  cage exposes no mapping configuration. Verify with the target panel.

### sway

- **Packaged:** yes; Pi archive `1.10.1-2+rpt1`, Debian stable 1.10.1, upstream
  1.12 (2026-05-25).
- **Maintenance:** very active.
- **Autostart without a desktop:** `exec` lines in `~/.config/sway/config`; can be
  launched from a TTY or systemd session.
- **Cursor:** `seat seat0 hide_cursor <timeout-ms>` is a first-class setting
  ([sway-input(5)](https://man.archlinux.org/man/sway-input.5.en)).
- **Rotation:** `output <name> transform 90|180|270|flipped…` or `wlr-randr`
  ([sway-output(5)](https://man.archlinux.org/man/sway-output.5.en)).
- **Touch:** `input <identifier> map_to_output <output>` plus the output transform.
- **Fit:** capable, but it brings tiling-window-manager concepts (workspaces,
  borders, config language) that a one-app kiosk does not need. More to get wrong
  than labwc.

### wayfire

- **Packaged:** yes, but legacy on Pi OS: Pi archive `0.9.0-5+rpt1`; upstream 0.11.
  Raspberry Pi's October 2024 announcement says Wayfire will no longer be
  supported with updates on Pi OS
  ([announcement](https://www.raspberrypi.com/news/a-new-release-of-raspberry-pi-os/)).
- **Autostart:** `[autostart]` in `wayfire.ini`.
- **Rotation/touch:** supports wlr-output-management, so `wlr-randr` works, but
  the stack is frozen on Pi OS. Do not start a new deployment on it.

### weston

- **Packaged:** Debian (`14.0.2` stable, `16.0.0` testing); not part of Pi OS's
  desktop stack.
- **Kiosk shell:** exists and is designed for single-app use
  ([Weston kiosk-shell](https://wayland.pages.freedesktop.org/weston/toc/kiosk-shell.html)).
- **Missing pieces:** Weston does **not** implement wlr-output-management or
  wlr-output-power-management (both marked `x` in the Wayland Explorer tables),
  so no `wlr-randr`, `kanshi`, or `wlopm`. Rotation is `weston.ini` plus restart.
  It is a reference compositor, not a good fit for Calvin's runtime display
  controls.

---

## 3. Pi 3B/3B+: is Wayland + Chromium usable?

**Technically yes; practically, not yet a safe default.**

What is verified:

- Raspberry Pi says labwc was optimised until it "runs just as fast as X on older
  Raspberry Pi models", and Trixie was tested back to Pi 1; a staff comment calls
  the Pi 3 desktop "perfectly usable"
  ([labwc announcement](https://www.raspberrypi.com/news/a-new-release-of-raspberry-pi-os/),
  [Trixie comments](https://www.raspberrypi.com/news/trixie-the-new-version-of-raspberry-pi-os/)).
  That is a **desktop** claim, not a Chromium-kiosk benchmark.
- The Pi 3 GPU is VideoCore IV: Mesa's VC4 driver supports Pi 0–3 with OpenGL
  ES 2.0 ([Mesa VC4](https://docs.mesa3d.org/drivers/vc4.html)). A wlroots
  compositor can run on it, but every frame is composited by that GPU, and
  Chromium's raster/compositing competes for the same 1 GB of RAM.
- Pi 3B/3B+ have 1 GB RAM. Calvin's own install guide already says "Pi 3B / 3B+
  works, but Chromium is slow" and treats Pi 4/5 as recommended
  ([KIOSK_INSTALL.md](../setup/KIOSK_INSTALL.md)). Raspberry Pi's kiosk tutorial
  sets the floor at "Pi 3 or newer with at least 1 GB RAM", and Chromium/Firefox
  refuse to run below that ([tutorial](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/)).
- Real reports are mixed, and none show a performance win:
  - A Pi 3B+ user running Bookworm + labwc + Chromium kiosk reports Chromium
    starting to a **white screen** from the labwc autostart
    ([forum report](https://forums.raspberrypi.com/viewtopic.php?p=2386021)).
    Anecdotal, but exactly the kind of failure a kiosk cannot have.
  - A Pi 3 user reports Chromium 149 failing to start on a fresh Trixie 32-bit
    Desktop image, on **both X11 and Wayland**
    ([forum report, June 2026](https://forums.raspberrypi.com/viewtopic.php?p=2381452)).
    Current Chromium is 156, so this may be fixed; **UNVERIFIED**.
  - Chromium has a low-RAM warning popup on Pi 3-class devices that is hard to
    suppress in kiosk mode ([Chromium issue 373891800](https://issues.chromium.org/issues/373891800)).
  - The most experienced comparable project, Anthias, deliberately does **not**
    put a compositor on Pi 3 or Pi 4: it uses linuxfb on Pi 1/2/3-32, eglfs on
    Pi 3-64/Pi 4, and cage/Wayland only on Pi 5/x86/Rock Pi 4
    ([Anthias hardware notes](https://github.com/Screenly/Anthias/blob/master/.claude/skills/anthias-hardware/SKILL.md)).
    That is a strong practitioner signal about where compositor overhead is
    affordable.
  - A small hobby project, KioskPi, does claim cage + Chromium on "Pi 3+ / Trixie
    64-bit" ([KioskPi](https://github.com/memcos/KioskPi)), but it is a
    one-maintainer project with no published benchmark. Treat it as existence
    proof, not evidence of acceptable performance.

**Conclusion:** Wayland + Chromium will boot on a Pi 3, and Pi OS defaults to it,
but there is no evidence it is faster than X11 for this workload, and the failure
reports cluster around exactly the Pi 3. Keeping X11 for Pi 3B/3B+ SPLIT is
reasonable and low-risk: X11 is still supported in Trixie, and the only thing we
give up is being on the default path. Re-evaluate after a measured Chromium 156
A/B test on a 3B+ (cold boot, first paint, tab switch, 24 h memory).

---

## 4. Replacing what the backend does today

Calvin currently uses `xrandr` (`display_orientation_service.py`,
`calvin_display_agent.py`) and `xset dpms` / `xset s`
(`display_power_service.py`, `calvin_display_agent.py`). Under Wayland those
tools either do not see the DRM output or do not own it: Xwayland is a client, not
the display server, so `xset dpms` cannot power the panel. The labwc maintainers
explicitly recommend `wlopm` for this instead of `wlr-randr --off`
([labwc integration](https://labwc.github.io/integration.html)).

| Need | X11 today | Wayland replacement | Compositor support | Caveats |
|---|---|---|---|---|
| Rotation / mode | `xrandr --output … --rotate left --mode 1920x1080` | `wlr-randr --output HDMI-A-1 --transform 90 --mode 1920x1080@60Hz` | cage, labwc, sway, wayfire (wlr-output-management v4); **not** weston | Output names change (`HDMI-1` → `HDMI-A-1`); transform direction differs from xrandr (see migration table); `CALVIN_DISPLAY_OUTPUT=HDMI-1` will be wrong |
| Output profile | `xrandr` script | `kanshi` profile, or `wlr-randr` at compositor start | cage, labwc, sway, wayfire | kanshi needs the compositor's output-management protocol; start it inside the session |
| Panel on/off | `xset dpms force off/on`, `vcgencmd display_power` | `wlopm --off <output>` / `--on <output>` | cage ≥0.3.0, labwc, sway, wayfire (wlr-output-power-management); **not** weston | Some monitors fake a hotplug when signal drops; labwc re-enables outputs by default → panel wakes. Set `<autoEnableOutputs>no</autoEnableOutputs>` and use `wlr-randr`/kanshi to enable at boot. `wlopm --on` can fail after a hotplug; `wlr-randr --output … --on` is the fallback |
| Legacy panel power | `vcgencmd display_power 0/1` | Not a Wayland API; keep only as a legacy Pi 3/4 fallback | n/a | Pi 5 `vcgencmd` may not register `display_power` at all; under `vc4-kms-v3d` on Pi 4 it can be a no-op or the panel can wake after ~12 s. Do not make it the primary path |
| Screen-blank timeout | `xset s N`, `xset +dpms`, `xset dpms N N N` | `swayidle -w timeout N 'wlopm --off *' resume 'wlopm --on *'`, or the backend schedule calling `wlopm` directly | labwc and sway support ext-idle-notify; `swayidle` works with both | Calvin's authoritative feature is a **schedule**, not an idle timeout. Keep the schedule logic and call `wlopm`; add idle blanking only if the product wants it |
| TV on/off (optional) | — | `cec-ctl -d /dev/cec0 --to 0 --standby` / `--image-view-on` | Display-server independent | Only works through HDMI-CEC on a TV; most monitors have no CEC. `cec-ctl` comes from `v4l-utils` ([cec-ctl(1)](https://man.archlinux.org/man/cec-ctl.1.en)) |

**Which compositor gets which protocol:** cage, labwc, sway, and wayfire support
both wlr-output-management and wlr-output-power-management. Weston supports
neither. That alone eliminates Weston for Calvin's runtime rotation/power.

**`wlopm` is in Debian Trixie** as `0.1.0-1` (arm64 `0.1.0-1+b1`), so it is one
`apt install` on Pi OS Lite; `wlr-randr` is `0.4.1-1`, `kanshi` `1.5.1-2`,
`swayidle` `1.8.0-1` (Debian madison, 2026-10-29).

---

## 5. Chromium on Wayland on a Pi

### Ozone flags and environment

- Chromium ≥140 auto-detects the display server and prefers Wayland when
  available; `--ozone-platform-hint` default changed to `auto`
  ([Chrome 140 change](https://www.omgubuntu.co.uk/2025/08/chrome-140-wayland-auto-detection-linux)).
  On current Pi OS Chromium (156) you normally do **not** need Ozone flags when
  Chromium is started inside a Wayland session.
- To force it, or if auto-detection fails, use `--ozone-platform=wayland`
  (documented in the [Ozone overview](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/ozone_overview.md)).
  `--enable-features=UseOzonePlatform` is the legacy form; do not add it blindly.
- A systemd-launched Chromium needs the session environment, not just the binary:
  `XDG_SESSION_TYPE=wayland`, `WAYLAND_DISPLAY=wayland-0`, and
  `XDG_RUNTIME_DIR=/run/user/<uid>`. Without those it may fall back to X11/
  XWayland or fail to connect. This is the single most important unit-file change.
- Keep kiosk flags minimal. Real Pi 5 cage kiosks run
  `chromium --kiosk --ozone-platform=wayland <url>` successfully
  ([rpi/linux #7721](https://github.com/raspberrypi/linux/issues/7721)).

### GPU raster and hardware video decode

- **Raster/compositing:** Pi 4/5 use V3D for rendering with VC4/KMS for display
  ([Mesa V3D](https://docs.mesa3d.org/drivers/v3d.html)); Pi 3 uses VC4
  (GLES2 only). Chromium does use the GPU for compositing/raster when Mesa/EGL
  works, but you must verify on the device with `chrome://gpu`. Do not cargo-cult
  `--use-gl=egl`, `--use-angle=gles-egl`, or `--ignore-gpu-blocklist`: a current
  Pi 5 cage kiosk report shows `--use-angle=gles-egl` triggering repeated V3D
  resets, while stock flags ran for hours
  ([rpi/linux #7721](https://github.com/raspberrypi/linux/issues/7721)).
- **Hardware video decode is model- and codec-specific, and not a reason to
  choose Wayland:**
  - Pi 4: the Raspberry Pi Chromium build can hardware-decode H.264 through the
    V4L2 stateful decoder; users report working 1080p playback with the RPi build
    ([forum report](https://forums.raspberrypi.com/viewtopic.php?t=357870)).
  - Pi 5: the legacy H.264 decoder was removed; the Pi 5 decoder is HEVC-only
    (rpivid/V4L2 stateless). Stock Chromium reports software decode and does not
    accept HEVC, so hardware decode is effectively unavailable without a patched
    build ([Pi 5 decode investigation](https://gist.github.com/schickling/089f4faf412b5267508f758408f0645f);
    a patched Chromium exists at [chromium-rpi-hevc](https://github.com/sslivins/chromium-rpi-hevc)).
  - Calvin's dashboard is calendars, photos, and web services; do not make video
    decode a migration gate. If a plugin embeds video, test that plugin
    separately.

### Known kiosk bugs / sharp edges

1. **Cursor** on cage (no option, vc4-hdmi counts as a pointer) and labwc
   (one-shot `HideCursor` only). See §2.
2. **Pi 3B+ labwc autostart → white Chromium window**, one forum report; test
   cold boot, not just `systemctl restart`.
3. **Pi 5 V3D GPU hang** in a cage + Chromium kiosk while zooming a map
   (Oct 2026, open). Stock flags are safer; add a GPU-hang watchdog/restart.
4. **Low-RAM warning** on Pi 3-class devices; the popup can cover a kiosk page.
5. **Cage headless boot binds zero outputs** and never recovers without udev in
   the container; Anthias added a watchdog that exits/restarts the viewer when
   there is no bindable output
   ([Anthias notes](https://github.com/Screenly/Anthias/blob/master/.claude/skills/anthias-hardware/SKILL.md)).
6. **Monitor hotplug wake** after `wlopm --off`; see §4.
7. **Panel over fullscreen** if you run the full Raspberry Pi Desktop; use the
   bare `rpd-wayland-core` stack (no panel) or configure the panel away.

---

## 6. What comparable projects do

| Project | Current stack | Why / lesson |
|---|---|---|
| **FullPageOS** | Raspberry Pi OS Bookworm (2024-11-19 base), 32-bit, Chromium 130, **X11** (uses `xdotool`, `x11vnc`); last release 0.14.0, 2025-07-14 ([release](https://github.com/guysoft/FullPageOS/releases/tag/0.14.0)) | The best-known "browser on boot" distro has not moved to Trixie/Wayland yet. Inertia and X11 tooling still dominate the kiosk-distro niche. |
| **Anthias (Screenly OSE)** | Per-board: linuxfb on Pi 1/2/3-32, eglfs/KMS on Pi 3-64/Pi 4, **cage/Wayland** on Pi 5/x86/Rock Pi 4; QtWebEngine viewer, not Chromium ([hardware notes](https://github.com/Screenly/Anthias/blob/master/.claude/skills/anthias-hardware/SKILL.md), [wayland launcher](https://github.com/Screenly/Anthias/blob/master/bin/lib/viewer/platform_wayland.sh)) | They only pay for a compositor where the SoC can afford it. On Wayland they rotate with `wlr-randr` transforms and blank with `wlr-randr --off`; they hit cage's headless/hotplug bugs and added a watchdog. This is the closest match to Calvin's problem. |
| **piSignage** | Current Pi player is **labwc/Wayland**; docs include a labwc cursor-hiding procedure and a Trixie post-install guide ([cursor guide](https://help.pisignage.com/hc/en-us/articles/59094755442201-Hiding-the-Mouse-Cursor-on-the-labwc-Wayland-Player)) | Commercial signage moved with Pi OS to labwc. It also confirms that cursor hiding is a manual hack (`HideCursor` + `wtype`), not a supported compositor feature. |
| **MagicMirror²** | Electron; v2.38 (2026-10-01) starts with `--ozone-platform=wayland` when `WAYLAND_DISPLAY` is set, otherwise X11 ([clientonly/index.js](https://github.com/MagicMirrorOrg/MagicMirror/blob/master/clientonly/index.js), [changelog](https://github.com/MagicMirrorOrg/MagicMirror/blob/master/CHANGELOG.md)) | Electron/Chromium upstream now handles Wayland; the remaining work is session environment, not browser patches. Many installed mirrors still run X11. |

The pattern: **new/high-end boards go Wayland; low-end boards stay on a
framebuffer/EGL stack; X11 remains common where tooling or inertia wins.** No
comparable project reports Wayland making a Pi 3 browser kiosk faster.

---

## 7. Proposed migration shape

### 7.1 Target matrix

| Hardware / topology | Default stack | Notes |
|---|---|---|
| Pi 5 / Pi 500 / CM5, SPLIT or FULL | **Wayland + labwc** | Primary target; test V3D hang and HEVC |
| Pi 4B / Pi 400 / CM4 (2 GB+), SPLIT or FULL | **Wayland + labwc** | Recommended minimum for FULL |
| Pi 3B / 3B+, **SPLIT** | **X11 + openbox (unchanged)** | Keep supported; optional Wayland pilot behind an env flag |
| Pi 3B / 3B+, **FULL** | **X11 + openbox** (best effort) | FULL officially needs Pi 4/5; do not block the migration on Pi 3 FULL |
| Pi Zero 2 W / older | Unsupported | 512 MB is below Chromium's practical floor |

Use an explicit `CALVIN_DISPLAY_STACK=x11|wayland` (default `auto`) in
`/etc/default/calvin-kiosk`, plus a model check from `/proc/device-tree/model`
(Calvin already reads this in `is_raspberry_pi()`). `auto` chooses X11 on Pi 3,
Wayland on Pi 4/5. Do not infer only from `WAYLAND_DISPLAY`: an X11 session can
have XWayland, and a broken Wayland session can leave a stale variable.

### 7.2 Dual support, not a flag day

1. **Phase 1 (SPLIT, opt-in):** add the Wayland unit/config and agent branch;
   install it only with `--display-stack wayland` or on Pi 4/5 test devices.
   Keep the X11 packages and units installed so rollback is a service switch,
   not a reimage.
2. **Phase 2 (SPLIT, default Pi 4/5):** make `setup-kiosk.sh` choose Wayland on
   Pi 4/5, X11 on Pi 3. Keep an env override.
3. **Phase 3 (FULL, Pi 4/5):** same selection in `setup.sh`; FULL on Pi 3 stays
   X11 and is documented as legacy.
4. **Phase 4 (Pi 3 reassessment):** only after an A/B test on 3B+ with the
   current Chromium, and only if it wins on cold boot and 24 h memory.

### 7.3 Backend / agent changes (proposed, not implemented here)

| File / service | Today | Wayland change |
|---|---|---|
| `backend/app/services/display_orientation_service.py` | Parses `xrandr --query`, applies `xrandr --rotate normal|left|right|inverted` | Add a Wayland branch: list/apply with `wlr-randr` (`--json` if available, else text); `--transform normal|90|180|270`; `--mode WxH@Hz`. Keep X11 branch for Pi 3. Do **not** use `/boot/config.txt display_rotate` as a live fallback under KMS; it is legacy firmware behaviour |
| `backend/app/services/display_power_service.py` | `vcgencmd display_power`, then `xset dpms force on/off`; timeout via `xset s`/`xset dpms` | Wayland branch: `wlopm --off <output>` / `--on <output>` for schedule; `wlr-randr --output <output> --on` as wake fallback; `swayidle` + `wlopm` only if idle blanking is required. `vcgencmd` becomes a legacy fallback, never the primary path |
| `deploy/kiosk-agent/calvin_display_agent.py` | `X11_ENV`, `xrandr` detection/rotation/mode, `apply_on()` uses `vcgencmd` + `xset` | Add `wayland` helpers (`wlr-randr`, `wlopm`), detect the stack, set `WAYLAND_DISPLAY`/`XDG_RUNTIME_DIR`; keep the schedule/reconcile logic unchanged; map orientation values to wlr transforms |
| `backend/app/utils/platform.py` | `has_x11()` runs `xset -q` | Add `has_wayland()` (env + `wlr-randr`/`wlopm` probe). Do not use `has_x11()` as a proxy for "can control the display" |
| `deploy/systemd/calvin-x.service` | `startx` on tty1 with `PAMName=login` | Add `calvin-wayland.service` (labwc) with the same PAM/logind session shape, `TTYPath=/dev/tty1`, `Conflicts=getty@tty1`, and `Before=calvin-kiosk*.service`; cage, if chosen, uses the upstream `cage@.service` template. Exactly one compositor unit is enabled |
| `deploy/systemd/calvin-kiosk*.service` | `DISPLAY=:0`, `XAUTHORITY=…`; waits for `/tmp/.X11-unix/X0` or `Xorg` | Wayland variant: `XDG_SESSION_TYPE=wayland`, `WAYLAND_DISPLAY=wayland-0`, `XDG_RUNTIME_DIR=/run/user/%U`; no `DISPLAY`/`XAUTHORITY`; wait for the Wayland socket/compositor process, not Xorg |
| `deploy/systemd/calvin-display-agent.service` | `DISPLAY=:0`, `XAUTHORITY=…` | Same Wayland environment so `wlopm`/`wlr-randr` can connect to the session |
| `scripts/setup-common.sh` (`CALVIN_KIOSK_PACKAGES`, `configure_display`, `configure_openbox_autostart`) | Installs `xserver-xorg`, `xinit`, `openbox`, `unclutter`, `xdotool`, `x11-xserver-utils`; writes `.xprofile`, `.xinitrc`, Openbox autostart | Split the package set by stack; Wayland needs `labwc`, `chromium`, `wlr-randr`, `wlopm`, `kanshi` (optional), `swayidle` (optional). Write `~/.config/labwc/autostart` with `wlr-randr`/Chromium and a cursor-hide action; no `unclutter`/`xset` on Wayland |
| `scripts/setup.sh` (FULL) | Installs `calvin-x.service` + `calvin-kiosk.service` | Select the compositor unit by model/flag; keep `calvin-app.service` and the local backend unchanged |
| `backend/app/services/kiosk_bundle.py` + `deploy/kiosk-agent/update-kiosk.sh` | Bundle is six files; updater has a hard-coded unit/path allowlist | Add the Wayland unit + labwc config to the bundle and to the updater allowlist (`KNOWN_UNITS`, path map), bump the bundle version, and test rollback. The current allowlist will reject an unknown unit by design |
| Docs | X11/openbox wording in `KIOSK_INSTALL.md`, `DEPLOYMENT_TOPOLOGIES.md` | Document the model matrix and the `CALVIN_DISPLAY_STACK` override |

### 7.4 Rotation mapping (must be verified on hardware)

`xrandr` and `wlr-randr` use different names and directions. A reasonable first
mapping, to be confirmed by looking at the panel:

| Calvin config | xrandr today | wlr transform (proposed) |
|---|---|---|
| landscape, not flipped | `normal` | `normal` |
| portrait, not flipped | `left` (90° CCW) | `90` (wlroots transform 90 is CCW) |
| landscape, flipped | `inverted` | `180` |
| portrait, flipped | `right` (90° CW) | `270` |

Anthias documents the same trap from the other direction: `wlr` transforms turn
counter-clockwise, so a user-facing "rotate 90° clockwise" maps to `270`
([Anthias notes](https://github.com/Screenly/Anthias/blob/master/.claude/skills/anthias-hardware/SKILL.md)).
Treat this table as a starting point and assert the result physically; a wrong
direction is easy to miss on a symmetric dashboard.

### 7.5 Environment keys (proposed)

```
CALVIN_DISPLAY_STACK=auto        # auto | x11 | wayland
CALVIN_DISPLAY_ROTATION=normal   # normal | left | right | inverted (existing)
CALVIN_DISPLAY_OUTPUT=HDMI-A-1   # Wayland names differ from xrandr's HDMI-1
CALVIN_DISPLAY_RESOLUTION=1920x1080@60
CALVIN_WAYLAND_DISPLAY=wayland-0
```

`CALVIN_DISPLAY_OUTPUT` deserves a compatibility pass: existing installs have
`HDMI-1`; Wayland uses `HDMI-A-1`. Accept both, or leave it unset and
auto-detect the first connected output, before changing any defaults.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Wayland session does not start reliably from systemd (no logind session, no `XDG_RUNTIME_DIR`, no DRM master) | Medium | Kiosk black on boot | Copy the `PAMName`/`pam_systemd`/TTY pattern from `calvin-x.service` and cage's `cage@.service`; test cold boot, not just restart; keep X11 fallback |
| Pi 3 regression (RAM/CPU/first paint) | High if switched | Slow or unusable kiosk | Keep Pi 3 on X11; A/B test before changing |
| Cursor visible in the middle of the screen | High on cage, medium on labwc | Cosmetic but looks broken | Prefer labwc; use `HideCursor`+`WarpCursor` at startup; for cage, udev-ignore `vc4-hdmi` pointer or transparent cursor theme; track cage >0.3.1 |
| Monitor wakes immediately after `wlopm --off` (fake hotplug) | Medium | Schedule fails at night | `<autoEnableOutputs>no</autoEnableOutputs>` in labwc; enable with kanshi/wlr-randr at boot; per-monitor test |
| `wlopm --on` does not restore after hotplug | Medium | Screen stays black in the morning | Fallback `wlr-randr --output … --on`; watchdog that re-enables the output |
| Rotation direction or touch mapping wrong | Medium | Portrait touchscreen unusable | Physical test on the exact panel; explicit `mapToOutput`; keep 180° test too |
| Pi 5 V3D GPU hang under Chromium | Low–medium | Black screen until restart | Stock Chromium flags; GPU-hang watchdog; test the actual dashboard/plugins for long sessions; track rpi/linux #7721 |
| Bookworm vs Trixie feature drift (labwc 0.8.4 vs 0.20.2, cage 0.2.0 vs 0.3.1) | High | Config that works on Trixie fails on Bookworm | Do not claim `autoEnableOutputs`/`HideCursor`/touch options on Bookworm without testing; gate features by compositor version |
| Bundle updater rejects the new unit | Medium | Remote update fails/rolls back | Update `BUNDLE_FILES`, `KNOWN_UNITS`, and the path allowlist together; test update + rollback |
| X11 disappears from a future Pi OS | Low now, certain eventually | Pi 3 support ends | Track Raspberry Pi release notes; plan a Pi 3 hardware refresh or a measured Wayland cutover before Trixie LTS ends |
| HDMI-CEC is not available on the monitor | High | CEC fallback useless | Treat CEC as optional; `wlopm` is the primary path |
| Video decode expectations | Medium | Stutter on video plugins | Do not promise HW decode; test per plugin/model; Pi 4 H.264 is the best case, Pi 5 HEVC is not enabled by default |

---

## 9. What must be tested on real hardware

Minimum matrix (do not sign off from a single Pi 5):

| Dimension | Cases |
|---|---|
| Board | Pi 3B, Pi 3B+, Pi 4B (2 GB and 4/8 GB), Pi 5 (4/8 GB), Pi 400/500 if available |
| OS | Trixie Lite 64-bit (primary), Trixie Lite 32-bit (spot check), Bookworm Lite 64-bit legacy (upgrade path) |
| Topology | SPLIT (remote backend) and FULL (local backend) |
| Display | HDMI 1080p; 4K on Pi 4/5; DSI Touch Display 2; portrait and 180°; cold boot with display attached; boot headless then hot-plug; monitor power-cycle |
| Boot | Cold boot 20×; boot with backend down; boot with network down; boot after unclean shutdown |
| Chromium | First paint; kiosk URL/query string; backend restart/reconnect; tab/screen switching; `chrome://gpu` and `chrome://media-internals`; 72 h soak; memory on Pi 3; GPU-reset logs (`dmesg | grep v3d`) |
| Rotation | All four orientations; output/mode change at runtime; touch coordinates after each; 180° + touch |
| Power | Schedule on/off across midnight and DST; `wlopm` off/on; wake after hotplug; fake-hotplug monitor; `vcgencmd` fallback on Pi 3/4 only |
| Cursor | No mouse; touch-only panel; USB mouse plugged/unplugged; after idle; after touch |
| Update | Kiosk bundle self-update; rollback; unit restart; signature/manifest checks; unknown-unit rejection |
| Regression | X11 Pi 3 still boots and the agent still rotates/powers the panel after the shared code changes |

**Acceptance criteria for flipping Pi 4/5 to Wayland:** 20/20 clean cold boots
with a display attached; no cursor at rest; rotation and touch correct in all
four orientations on the target panel; schedule off/on works for 7 consecutive
days including a monitor power-cycle; Chromium survives a 72 h soak without a
GPU-reset black screen; rollback to X11 is one service switch and re-tested.

---

## 10. Open questions / explicitly unverified

- **UNVERIFIED:** a formal Raspberry Pi end-of-support date for X11. Debian's
  Trixie LTS (2030-06-30) is the outer bound I can defend; Raspberry Pi has made
  no such promise for its own packages.
- **UNVERIFIED:** whether Bookworm's labwc 0.8.4 supports `autoEnableOutputs`,
  `HideCursor`/`WarpCursor`, and `<touch><mapToOutput>`. Trixie's 0.20.2 does.
  Test before promising feature parity on legacy installs.
- **UNVERIFIED:** current (Chromium 156) status of the Pi 3 Trixie "Chromium
  won't start" report; the report is from June 2026 and Chromium has moved on.
- **UNVERIFIED:** whether `wlopm --on` works reliably on the specific monitors
  Calvin users have; the labwc discussion shows at least one monitor family where
  it does not, and `wlr-randr --on` is required.
- **UNVERIFIED:** touch rotation behaviour on the DSI Touch Display 2 under cage
  specifically; labwc's wlroots path and explicit `mapToOutput` are better
  documented.
- **UNVERIFIED:** whether Calvin's dashboard (no heavy WebGL) can trigger the Pi 5
  V3D hang; the public report is a map/OpenLayers page, so test the real screens.

---

## Sources

Official / primary:

- [Raspberry Pi OS Trixie announcement](https://www.raspberrypi.com/news/trixie-the-new-version-of-raspberry-pi-os/)
- [Raspberry Pi OS labwc/Wayland default announcement](https://www.raspberrypi.com/news/a-new-release-of-raspberry-pi-os/)
- [Raspberry Pi kiosk-mode tutorial](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/)
- [Debian releases / EOL table](https://www.debian.org/releases/)
- [Debian bookworm LTS](https://www.debian.org/releases/bookworm/)
- [Raspberry Pi Trixie package archive](http://archive.raspberrypi.com/debian/dists/trixie/main/binary-arm64/Packages.gz)
- [Cage configuration wiki](https://github.com/cage-kiosk/cage/wiki/Configuration)
- [Cage systemd boot guide](https://github.com/cage-kiosk/cage/wiki/Starting-Cage-on-boot-with-systemd)
- [cage(1)](https://man.archlinux.org/man/cage.1.en)
- [labwc integration guide](https://labwc.github.io/integration.html)
- [labwc rc.xml reference](https://github.com/labwc/labwc/blob/master/docs/rc.xml.all)
- [labwc actions](https://labwc.github.io/labwc-actions.5.html)
- [labwc config: autoEnableOutputs](https://labwc.github.io/labwc-config.5.html#entry_core_autoenableoutputs)
- [sway-output(5)](https://man.archlinux.org/man/sway-output.5.en)
- [sway-input(5)](https://man.archlinux.org/man/sway-input.5.en)
- [Weston kiosk-shell](https://wayland.pages.freedesktop.org/weston/toc/kiosk-shell.html)
- [wlr-output-management support table](https://wayland.app/protocols/wlr-output-management-unstable-v1)
- [wlr-output-power-management support table](https://wayland.app/protocols/wlr-output-power-management-unstable-v1)
- [Chromium Ozone overview](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/ozone_overview.md)
- [cec-ctl(1)](https://man.archlinux.org/man/cec-ctl.1.en)
- [Mesa VC4](https://docs.mesa3d.org/drivers/vc4.html)
- [Mesa V3D](https://docs.mesa3d.org/drivers/v3d.html)
- [Debian package versions (madison)](https://api.ftp-master.debian.org/madison?package=wlopm&table=all)

Real-world reports / comparable projects:

- [Chrome 140 Wayland auto-detection](https://www.omgubuntu.co.uk/2025/08/chrome-140-wayland-auto-detection-linux)
- [Pi 5 V3D hang in a cage Chromium kiosk (2026-10-27)](https://github.com/raspberrypi/linux/issues/7721)
- [Pi 5 Chromium hardware-decode investigation](https://gist.github.com/schickling/089f4faf412b5267508f758408f0645f)
- [chromium-rpi-hevc (Pi 5/CM5 HEVC patch)](https://github.com/sslivins/chromium-rpi-hevc)
- [Pi 3 Trixie Chromium 149 report](https://forums.raspberrypi.com/viewtopic.php?p=2381452)
- [Pi 3B+ labwc Chromium white-screen report](https://forums.raspberrypi.com/viewtopic.php?p=2386021)
- [Chromium low-RAM kiosk warning](https://issues.chromium.org/issues/373891800)
- [Cage cursor issue #299](https://github.com/cage-kiosk/cage/issues/299)
- [labwc monitor power discussion #3455](https://github.com/labwc/labwc/discussions/3455)
- [labwc stylus rotation issue #1990](https://github.com/labwc/labwc/issues/1990)
- [piSignage labwc cursor workaround](https://help.pisignage.com/hc/en-us/articles/59094755442201-Hiding-the-Mouse-Cursor-on-the-labwc-Wayland-Player)
- [FullPageOS 0.14.0 release](https://github.com/guysoft/FullPageOS/releases/tag/0.14.0)
- [Anthias hardware notes](https://github.com/Screenly/Anthias/blob/master/.claude/skills/anthias-hardware/SKILL.md)
- [Anthias Wayland launcher](https://github.com/Screenly/Anthias/blob/master/bin/lib/viewer/platform_wayland.sh)
- [MagicMirror clientonly Wayland handling](https://github.com/MagicMirrorOrg/MagicMirror/blob/master/clientonly/index.js)
- [KioskPi (cage on Pi 3+ claim)](https://github.com/memcos/KioskPi)
