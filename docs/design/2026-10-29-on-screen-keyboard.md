# On-screen keyboard (OSK) for touch kiosks: UI spec

Status: ready to build as its **own issue**. It goes with CLV-9 (admin auth) and should land with it or just
after, because CLV-9's kiosk lock screen uses it. Mockups: [mocks/osk/osk.html](mocks/osk/osk.html), with
PNGs in [mocks/osk/png/](mocks/osk/png/) (`k1.png` … `k5.png`). Real theme tokens. Where this doc and the
mock disagree, this doc wins.

## 1. Why, and why this approach

People must be able to use Settings on the kiosk itself, including signing in. Kiosks have a touchscreen
and no keyboard.

- **System keyboard: rejected.** Calvin kiosks run Chromium on X11 (`calvin-x.service` → `startx`). The
  Pi's own keyboard, squeekboard, is Wayland-only, and even there Chromium often doesn't show it
  automatically. The X11 keyboards (onboard, matchbox-keyboard) are unreliable with Chromium. All of them
  would mean changes to the Pi image, and Calvin couldn't control them.
- **Chosen: an in-app keyboard built on [`simple-keyboard`](https://github.com/hodgef/simple-keyboard)**
  (MIT, framework-agnostic, actively maintained, currently 3.8.x). Pin an exact version that is at least
  two weeks old. Use it **only as the renderer** (layouts, layers, key events). Calvin owns when it shows,
  how text is inserted, and how it looks. Frontend only: no backend or Pi changes.

## 2. Pieces

| Piece | Path | What it is |
|---|---|---|
| `OnScreenKeyboard` | `frontend/src/components/ui/OnScreenKeyboard.vue` | Teleported to `body`, mounted once in `App.vue`. Wraps `simple-keyboard`. |
| `useOnScreenKeyboard` | `frontend/src/composables/useOnScreenKeyboard.js` | Global state: `enabled`, `visible`, `target` (the focused element), `layout`, `height`. Owns the focus listeners and text insertion. |
| `calvin-osk` theme | inside `OnScreenKeyboard.vue` (scoped + `:deep`) | Replaces `hg-theme-default`. Don't import simple-keyboard's default theme CSS beyond its base layout rules. |
| Setting | Device › Keyboard: `onScreenKeyboard` config key | `'auto' \| 'on' \| 'off'`, default `'auto'`. |

## 3. When it shows

**Enabled** when:
- `onScreenKeyboard === 'on'`, or
- `onScreenKeyboard === 'auto'` **and** `useTouchCapability().isTouch` **and** viewport width ≥ 720px.
  Phones and tablets under 720px keep their own system keyboard.

**Targets:** a global `focusin` listener on `document`. The target is an `<input>` of type `text`, `search`,
`url`, `email`, `password` or `number` (or one with no type), or a `<textarea>`, that is not `readonly` or
`disabled` and has no `data-osk="off"` ancestor. Native pickers (`time`, `date`, `color`, `range`, checkboxes)
never get it.

**Show:** on focus of a target. Also when an already-focused target is tapped again after the keyboard was
hidden (a `pointerdown` on `target`).
**Hide:**
- the Hide key;
- focus moving to a non-target element or to nothing (wait one `requestAnimationFrame` before deciding, so
  focus jumping between two fields doesn't flicker);
- route change;
- Escape on a physical keyboard;
- a **trusted** physical keypress in the target (`event.isTrusted` and not from the OSK). That means someone
  has a real keyboard, so stay hidden until the next focus.

**Never steal focus.** Set simple-keyboard's `preventMouseDownDefault: true`, plus
`@pointerdown.prevent` on the keyboard root, so the input keeps focus and caret while keys are tapped.

**No autofocus** anywhere on touch (CLV-9 §6 stands). The keyboard appears only when someone taps a field.

## 4. Layouts

Five layouts. The layout is chosen from the target when it gets focus. Tokens in braces are function keys.

```
default (text, search, password, textarea)
q w e r t y u i o p {bksp}
a s d f g h j k l {enter}
{shift} z x c v b n m , . {shift}
{numbers} {accents} {space} - {hide}

url (type=url) and email (type=email; "@" replaces "/" and ":" is dropped)
q w e r t y u i o p {bksp}
a s d f g h j k l {enter}
{shift} z x c v b n m - _ {shift}
{numbers} / : {space} . .com {hide}          email: {numbers} @ {space} . .com {hide}

symbols ({numbers} from any letter layout)
1 2 3 4 5 6 7 8 9 0 {bksp}
@ # $ % & * - + ( ) {enter}
{abc} ! " ' : ; / ? _ = {abc}
{abc} {space} . , {hide}

accents ({accents}; Shift gives capitals)
å ä ö æ ø é è ü ñ ß {bksp}
á à â ê ë í ï ó ô ú {enter}
{shift} ç õ œ ã ' ` ~ ^ ¨ {shift}
{abc} {space} . , {hide}

numeric (type=number, or inputmode=numeric/decimal), 4×4 grid, 440px wide, centred
1 2 3 {bksp}
4 5 6 -
7 8 9 .
{hide} 0 , {enter}
```

- **Shift** is one-shot: tap, type one capital, back to lowercase. Tapping Shift twice within 400ms locks
  caps until Shift is tapped again. Shift keys show `k--on` while active. Letter keys show capitals while
  Shift is active.
- **Backspace** repeats when held: after a 500ms delay, every 60ms.
- `{numbers}` = **?123**, `{abc}` = **abc**, `{accents}` = **åäö**, `.com` types `.com`.
- **Space** has no label.
- **Enter** label: if the target is inside a `<form>` with a visible `button[type=submit]` (or the first
  `.btn--primary` / `.security-btn--primary` in it), use that button's text (for example **Sign in**,
  **Set password**). Otherwise **Enter**. On the numeric pad it is always **Done**.
- **Enter behaviour:** dispatch `keydown` + `keyup` `Enter` on the target. If the keydown wasn't
  `defaultPrevented` and the target has a `form`, call `form.requestSubmit()`. For a `<textarea>`, insert
  `\n`. On numeric **Done**, also hide the keyboard. (Existing handlers like `@keyup.enter="add"` in
  SecuritySettings keep working.)

## 5. Text insertion

Don't use simple-keyboard's internal input buffer (it loses the caret on mid-string edits). Handle
`onKeyPress(button)` yourself:
- Character: replace `target.value.slice(selectionStart, selectionEnd)` with the character, put the caret
  after it, then dispatch `new Event('input', { bubbles: true })` so `v-model` updates.
- `{bksp}`: delete the selection, or the code point before the caret (`[...str]`-aware, so `å` and emoji
  don't split).
- `type=number` and `type=email` don't support `selectionStart`: treat them as append and delete-last.
- Respect `maxlength`.
- No key-preview bubbles (so keys aren't magnified over a password). The pressed state is the only feedback.

## 6. Layout and look

- **Position:** `position: fixed; left: 0; right: 0; bottom: 0; z-index: 1100` (above dialogs at 1000 and
  the scrim at 999). Teleported to `body`, so it is **not** affected by the Settings `--ui-scale` zoom and
  is always the same physical size.
- **Height:** `min(300px, 45dvh)`. 4 rows at 1280×720 is 300px; at 800×480 it is 216px. Publish the live
  height as `--osk-height` on `:root` (`0px` when hidden).
- **Panel:** `background: var(--bg-0)`, `border-top: 1px solid var(--line)`,
  `box-shadow: 0 -10px 30px -18px var(--shadow-hover)`, `padding: 10px 12px 12px`, rows `gap: 8px`
  (6px and 8px padding when height < 260px).
- **Keys:** `min-height: 44px`, rows share the height equally. `background: var(--bg-2)`,
  `border: 1px solid var(--line)`, `border-radius: var(--radius-sm)`, `box-shadow: 0 1px 0 var(--line)`,
  `font: 400 1.25rem var(--font-ui)` (1.05rem when height < 260px), `color: var(--ink)`. In the light theme
  `--bg-2` is white on a `--bg-0` panel, so the keys read clearly (white-on-white is the trap to avoid).
  - Function keys: `background: color-mix(in srgb, var(--ink) 6%, var(--bg-0))`, `color: var(--ink-2)`,
    `var(--fs-md)` weight 500. Width 1.5×. Icons for Backspace, Shift and Hide are 22px stroke SVGs, and
    each has an `aria-label` (**Backspace**, **Shift**, **Hide keyboard**).
  - Enter: 2× wide, `background: var(--focus)`, `color: var(--focus-ink)`, weight 600.
  - Space: 6× wide.
  - Pressed: `background: color-mix(in srgb, var(--focus) 22%, var(--bg-2))`, `translateY(1px)`, no shadow.
  - Shift active / caps locked: `background: color-mix(in srgb, var(--focus) 16%, var(--bg-2))`,
    `border-color: var(--focus)`.
- **Motion:** slide up `transform: translateY(100%) → 0`, 180ms ease-out. Hide 120ms ease-in. Under
  `prefers-reduced-motion`, no transition.

### Making room (every page)

- `.settings-content` (the scroll container) gets `padding-bottom: var(--osk-height)`. After showing,
  scroll the target into view: `target.scrollIntoView({ block: 'center' })` within the visible area.
- **Fixed dialogs** (AdminSignInDialog, ConfirmModal, InstanceModal, `.settings-phone`) centre within
  `calc(100dvh - var(--osk-height))`. Put this rule in a shared class, for example
  `top: calc((100dvh - var(--osk-height)) / 2)`, and apply it to each.
- Add nothing to the dashboard. It has no text fields, and dialogs over it follow the rule above.

### CLV-9 lock screen and dialog while the keyboard is up (K1, K3)

- The "or" seam and `PhoneSetupCard` are hidden. The auth card centres in the area above the keyboard.
- When `100dvh - 64px - --osk-height < 320px` (the 800×480 kiosk), the card also hides its icon, title,
  lead, recovery block and primary button, and shows only the field (and any error or 429 banner). Enter
  carries the submit label.
- In the sign-in dialog the phone half is hidden and the dialog shrinks to its narrow form.

## 7. Setting

Device › Keyboard gets a new first row (`SettingRow` + existing `SegmentedControl`):
- Label **On-screen keyboard**
- Description **Shows a keyboard on the screen when you tap a text field. Auto turns it on for touch screens.**
- Options **Auto** / **Always** / **Off** → `'auto'` / `'on'` / `'off'`.

Add registry keywords: keyboard, on-screen, typing, osk.

## 8. Accessibility

- The keyboard root has `role="group"` and `aria-label="On-screen keyboard"`, and every key is a
  `<button type="button" tabindex="-1">` (it is a pointer input device, not a tab stop; a physical keyboard
  hides it anyway).
- Typed characters reach the real input, so screen readers announce them the same way they would from a
  hardware keyboard.
- Password fields: no previews, no logging of key presses (`logDebug` must not print key values).
- Contrast: key text `--ink` on `--bg-2` and Enter `--focus-ink` on `--focus` use the existing
  token pairs, which already meet AA in both themes.

## 9. Tests (vitest + @vue/test-utils)

- Focusing a text input when enabled shows the keyboard. A `time` input, a `readonly` input, or a
  `data-osk="off"` area doesn't.
- `auto` on a non-touch or < 720px viewport → never shown. `off` → never shown. `on` → shown on desktop.
- Insertion at the caret in the middle of a string, Backspace over a selection, `å` as one code point,
  `maxlength` respected, and `input` dispatched so `v-model` updates.
- One-shot Shift resets after one letter; a double tap locks.
- Enter: in a form → `requestSubmit` is called; with a `@keyup.enter` handler → the handler runs; the
  Enter label takes the form's primary button text.
- A trusted physical keydown hides it. Blur to body hides it after rAF. Moving focus between two fields
  keeps it visible.
- `--osk-height` is set on show and reset to `0px` on hide.
