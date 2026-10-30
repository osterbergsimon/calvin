# On-screen keyboard: off switch and hardware-keyboard auto (CLV-27)

Status: spec. Mockup: [mocks/clv-27/clv-27.html](mocks/clv-27/clv-27.html), PNGs `mocks/clv-27/png/k1.png` (K1) and
`k2.png` (K2 + K3). Frontend only, using the existing kiosk overrides API (no backend or agent change). Amends the on-screen
keyboard spec ([2026-10-29-on-screen-keyboard.md](2026-10-29-on-screen-keyboard.md) §3) and uses the
**This screen** scope from the settings audit ([2026-10-30-settings-copy-audit.md](2026-10-30-settings-copy-audit.md) §2).

## 1. Decision

- **One setting per screen: Auto · On · Off.** It is the existing `onScreenKeyboard` key, now scoped to the screen.
- **Auto learns from typing.** On a touchscreen, the keyboard shows until someone types a real character on a
  physical keyboard. After that it stays hidden on that screen until someone asks for it again.
- **There is always a way back.** On any touchscreen, when a text field is focused and the keyboard is hidden for
  any reason (Off, learned, or hidden with ⌄), a **⌨ Keyboard** button shows. Tapping it opens the keyboard. This
  matters most on the admin password screen, where you can't reach Settings without typing.

## 2. Detection signal

**Use the browser: a trusted, printable key press in a text field.** Don't use the kiosk agent, and don't use
`navigator.keyboard`.

A key press counts as **physical typing** when all of these hold:
- `event.isTrusted`: the OSK dispatches synthetic events (`isTrusted === false`), so it never counts;
- the target is an OSK target field (`isOskTarget`);
- `event.key` is one printable character (`key.length === 1`, not a space) and no Ctrl, Alt or Meta is held.

That excludes what a remote or button box sends (arrows, Enter, Escape, media and F-keys), so Calvin's button
bindings never switch the keyboard off.

Why not the agent (`/proc/bus/input/devices`)?
- Many USB remotes, air-mice and HDMI-CEC bridges register as full keyboards. evdev can't tell them apart from a
  real one, so Auto would wrongly hide the keyboard on remote-driven kiosks.
- It only covers Pi kiosks running the agent, not laptops or tablets.
- Unplug detection needs polling, an agent update, a new API and a fleet rollout, and it still has the remote problem.

Typing is the one signal that proves *someone here types on a keyboard*, which is the question Auto asks. It can't
see an unplug, so the way back (§4) also clears what Auto learned.

`navigator.keyboard` only offers layout maps and lock. It has no "is a keyboard connected" signal.

## 3. Behaviour by mode

| Mode | Focus a text field (touchscreen) | Physical typing | ⌨ Keyboard button |
|---|---|---|---|
| **Auto** (default) | Shows the keyboard, unless this screen has learned a hardware keyboard | Hides it now **and** learns: `localStorage["calvin-osk-hardware-seen"] = "1"` | Shown while hidden. Tap → keyboard opens **and** the learned flag is removed |
| **On** | Always shows | Hides it for this field only (today's behaviour). Doesn't learn | Shown after ⌄ or typing hid it |
| **Off** | Never shows by itself | — | Shown. Tap → keyboard opens for this field only. The mode stays Off |

- Auto on a **non-touch** screen (or narrower than 720px) never shows the keyboard and never shows the button,
  as today. On and Off keep their meaning everywhere.
- The learned flag is per browser and is always stored in `localStorage` (try/catch; if storage fails, it lasts
  for the page load). It is learned while signed out, so it must not need the admin.
- Physical typing while the keyboard is open hides it within the same keydown, and the typed character still
  lands in the field (don't call `preventDefault`).

## 4. The ⌨ Keyboard button

- **When:** touchscreen (`isTouch`), an OSK target field has focus, and the keyboard isn't visible. It hides on blur
  and when the keyboard opens. It is never shown on non-touch screens: they have a keyboard.
- **Where:** `position: fixed`, `right: 16px`, `bottom: 16px` (plus `env(safe-area-inset-bottom)`). `z-index: 1100`, the OSK panel's
  layer, above dialogs and their scrim at 1000 (`AdminSignInDialog`, `ConfirmModal`).
- **Look:** a pill, height 48px, padding 0 16px, `--bg-1`, 1px `--line`, `--radius-md`,
  `box-shadow: 0 6px 18px -8px var(--shadow-hover)`. `mdiKeyboardOutline` 20px `--ink-2` + **Keyboard**
  (`--fs-sm`, 500, `--ink`).
- **Behaviour:** `pointerdown.prevent` (focus and caret stay in the field, like every OSK key). Tap → show the OSK
  for the focused field (in Auto, also remove `calvin-osk-hardware-seen`). `<button type="button"
  aria-label="Show on-screen keyboard">`.
- **Appear:** 120ms fade, none under reduced motion. No auto-hide timer.
- Fields inside `[data-osk="off"]` get no button either.

## 5. Admin password screen (lock, setup, sign-in dialog)

No special case: the rules above apply. In practice:
- Learned/Off → focusing the password field shows **⌨ Keyboard** bottom-right (mock K1). One tap opens the
  keyboard, and the CLV-21 layout key and picker are inside it as usual.
- Someone typing on a hardware keyboard never sees the OSK, which is the point.
- The layout picker only affects the on-screen keyboard. A hardware keyboard types with the kiosk OS's keymap.
  CLV-27 doesn't change that, and no copy on these screens mentions it.

## 6. The setting

**Screen & keyboard › On-screen keyboard** (section name from the audit, §3.3). It stays next to its layout rows,
not in Dashboard › Touch & focus: one place for everything about that keyboard. Search keywords add "hardware
keyboard", "physical keyboard", "turn off keyboard".

Row (mock K2):
- Label **On-screen keyboard** + **This screen** chip. SegmentedControl **Auto · On · Off**.
- Description, by state:
  - Auto, nothing learned: **Shows on touchscreens when you tap a text field. Typing on a real keyboard hides it on this screen.**
  - Auto, learned: **Hidden here because a keyboard was used.** + text button **Show it again** (removes the flag).
  - On: **Shows whenever you tap a text field.**
  - Off: **Never shows by itself. On a touchscreen, tap Keyboard by a field to open it.**

**Storage (the "This screen" model, shared with audit §2):**
- On a kiosk (`getKioskId()` set): write the kiosk override `onScreenKeyboard` via
  `PUT /api/kiosks/{id}/overrides`. That endpoint replaces the whole object, so GET it, merge the key and PUT it back. The kiosk already receives merged config, so the
  composable reads `configStore.onScreenKeyboard` unchanged. An admin can also set it from a phone (below).
- On any other browser: `localStorage["calvin-osk-mode"]`. It falls back to the server value when it's missing or
  unreadable.
- The global server key stays the default for screens without their own value. It is no longer shown as a row:
  the row edits this screen.
- Build one helper, `useScreenSetting(key)` (`frontend/src/composables/useScreenSetting.js`), returning
  `{ value, set, scope: "kiosk" | "browser" }`, so audit §2 (Touchscreen, Settings text size) reuses it.

**Kiosks › {kiosk}** (mock K3): a new `CollapsibleSection` **Touch & keyboard**, after Display hardware, with
**On-screen keyboard** Auto · On · Off. It uses the same override labels as the audit §3.5 (**Same as all screens** /
**Only this kiosk** + **Use the shared setting**). When the audit's §2 lands, Touchscreen joins this section.
The learned flag isn't visible here (it lives in the kiosk's browser).

## 7. Accessibility

- The button is a real `<button>` in the tab order after the focused field's form. Its name is **Show on-screen keyboard**.
- When the OSK hides because of physical typing, announce nothing: the user caused it and is typing.
- **Show it again** announces **On-screen keyboard will show again.** via the settings `aria-live` region.

## 8. Tests (vitest)

- `isPhysicalTyping(event, target)` predicate (named and exported, like `isTrustedKeyInTarget`): true for a trusted
  "a" in a target. False for untrusted, arrows, Enter, Escape, F5, Space, Ctrl+A, and a key on a non-target.
- Auto: physical typing hides and sets `calvin-osk-hardware-seen`; the next focus doesn't show the keyboard; the
  button shows; tapping it shows the keyboard and removes the flag.
- On: physical typing hides for this field only, the next focus shows again, and no flag is set.
- Off: focus never shows; the button shows on touch; a tap opens for this field and the mode stays Off.
- Non-touch: no button in any mode; Auto never shows.
- Button: `pointerdown` default prevented and focus stays in the input; hidden on blur and while the OSK is visible;
  renders above an open `AdminSignInDialog`; absent inside `[data-osk="off"]`.
- Lock screen with the flag set: password field focus → button visible → tap → OSK with the layout key.
- Storage: localStorage throws → mode falls back to the server value; the flag lasts for the page only.
- `useScreenSetting`: with a kiosk id it PUTs merged overrides; without one it writes localStorage; it reads the
  server default when unset.
- Settings row: the four description states; **Show it again** clears the flag. Kiosks row: inherit/override labels
  and **Use the shared setting** removes the key.
