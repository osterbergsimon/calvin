# Keyboard layout picker on the keyboard itself (CLV-21)

Status: spec. Mockup: [mocks/clv-21/clv-21.html](mocks/clv-21/clv-21.html), PNGs `mocks/clv-21/png/l1.png` …
`l3.png`. Frontend only. Amends the on-screen keyboard spec
([2026-10-29-on-screen-keyboard.md](2026-10-29-on-screen-keyboard.md) §4, "Keyboard layouts").

## 1. Problem

The layout setting (Settings › Screen & keyboard › Keyboard layout) sits behind the admin lock, and the
`{layout}` key only exists when extra layouts are set. So on the lock screen, the setup screen and the sign-in
dialog, you type a password on whatever layout the device guessed, with no way to change it. That's the one
place a wrong layout hurts most.

## 2. Decision

**The layout key is always on the keyboard, on every field, and it opens a layout picker.** It isn't limited to
lock screens: the problem is "I can't reach the setting", and that's true for any field until you're signed in.
One consistent key is easier to learn than one that comes and goes.

- **Tap the layout key:**
  - with extra layouts set → cycle (as today);
  - with no extras → open the picker.
- **Long-press the layout key (≥ 500ms), or tap the active-layout label on the space bar** → always open the picker.
  The space-bar label makes the picker discoverable without knowing about long-press.
- Independent of the app language, as before: the picker lists layouts, never UI languages.

## 3. The layout key and space bar

- `{layout}` is now in the bottom row of **every** letter layout (default, url, email), not only with extras:
  `{numbers} {layout} {accents} {space} …`. For url and email, it goes after `{numbers}`.
- The label is the active layout's code (**EN**, **SV**, …), as today. `aria-label`: with extras,
  **Switch keyboard layout, now {name}**; without, **Keyboard layout: {name}. Opens the list.**
  `aria-haspopup="true"`.
- The space bar **always** shows the active layout's name (`--ink-3`, `--fs-sm`), not only with extras. That tells you
  on a lock screen which layout you're typing on. Tapping the space bar types a space; only a tap on the **label
  text** opens the picker. The label is its own button inside the key, at least 44×32px. `aria-label`:
  **Change keyboard layout**.

## 4. The picker (an in-keyboard layer)

The picker **replaces the keyboard's rows** inside the keyboard panel. It isn't a popover, so it never covers the
field or the form, and the panel keeps its height (`--osk-height` is unchanged).

- Heading row (`--fs-md`, `--ink-2`, left): **Keyboard layout**.
- A grid of option buttons, 4 columns (2 at panel widths under 480px). Each option is ≥ 44px tall and uses the
  standard key style:
  1. **Default ({main name})**: uses the layout set in Settings (or the device's suggestion). Shown first.
  2. **English**, **Svenska**, **Suomi**, **Norsk**, **Dansk**, **Deutsch**, **Français**, each with its code in
     `--font-data` `--ink-3` after the name (for example "Svenska SV").
  - The active choice uses the Shift-active style (`color-mix(in srgb, var(--focus) 16%, var(--bg-2))`,
    `border-color: var(--focus)`) and `aria-pressed="true"`.
- Bottom row: **abc** (back to letters without changing anything), right-aligned, function-key style.
- Choosing an option switches immediately and returns to the letter layer. Focus and caret stay in the field
  (same `pointerdown.prevent` rule as all keys).
- Panel under 260px tall (800×480 → 216px): heading 22px, the option codes are hidden, the first option reads
  **Default ({main code})** (for example "Default (EN)"), and the bottom row is 44px. 8 options in 4 columns still
  fit at ≥ 44px each.
- `role="group"`, `aria-label="Keyboard layout"`; options are `<button>`s.

## 5. What the choice means

- Picking a named layout saves it **on this device** in `localStorage["calvin-osk-device-layout"]`.
  It is honoured **even if it isn't the main or an extra layout**. Today's code only accepts a stored layout
  that is in `[main, ...extras]` (`useOnScreenKeyboard.js:156-160`). Change that check to "any valid layout id".
- **Migration:** the old `localStorage["calvin-osk-layout"]` key was written on *every* device by the previous
  `watch(activeLetterLayout, …, { immediate: true })`, so it is not evidence of a device choice. Do not read it
  (especially now that any valid id is honoured, which would pin every upgraded kiosk to its old main layout).
  Remove it on load; devices start from Settings again.
- **Default ({main name})** removes the device choice (`removeItem`), so the device follows Settings again.
- Cycling with extras: the order is `[main, ...extras]`. If the active layout isn't in it (a device choice), the
  first tap goes to `main`.
- Nothing is written to server config, so it works signed out (the lock screen, the setup screen and the
  sign-in dialog) and needs no admin.
- Settings › Keyboard layout stays the default for devices that haven't chosen. Under it, a `--fs-sm` `--ink-2`
  line, shown only on a device with its own choice: **This screen uses {name}, chosen on the keyboard.** with a
  text button **Use default**, which removes the device choice.

## 6. Tests (vitest)

- `{layout}` is present in the default, url and email layouts with no extras, and its label is the active code.
- Tap with no extras opens the picker; tap with extras cycles; long-press (500ms, fake timers) opens the picker
  in both cases.
- The space-bar label is always rendered; tapping the label opens the picker; tapping the rest of the key types a space.
- Picker:
  - lists Default + 7 layouts in order, and the active one has `aria-pressed`;
  - choosing writes `calvin-osk-device-layout` and returns to letters; **Default** removes the key;
  - a pre-existing legacy `calvin-osk-layout` is ignored and removed, and does not pin the layout;
  - **abc** changes nothing;
  - focus stays in the input.
- A stored layout outside `[main, ...extras]` is honoured; cycling from it goes to main.
- It works while signed out (`AuthLockScreen` with the OSK visible): no config write is attempted.
- Settings shows the "chosen on the keyboard" line only when the device has its own choice; **Use default**
  clears it.
