# Pages & regions editor on phones and small kiosks

Status: spec (no mockup yet). Frontend only. `ScreenRegionEditor.vue` has no responsive rules: the preview is fixed
at 560px (`DEVICE_MAX`), the inspector rail is 340px, and moving the clock bar uses HTML5 drag, which touch doesn't
trigger. On a phone (~390px), the screen we recommend for setup, and on the 800×480 kiosk, the editor overflows.

## 1. Size classes

Measured on the modal with a `ResizeObserver` (not media queries, so a kiosk with the OSK open counts too):

| Class | When | Layout |
|---|---|---|
| **Wide** | width ≥ 1024 and height ≥ 640 | Today's layout, plus the fitted device (§2) |
| **Compact** | otherwise, and width ≥ 600 | Modal full-screen (`inset: 0`, radius 0); rail 280px; header subtitle hidden; the orientation badge moves under the device as a caption |
| **Phone** | width < 600 | One column: header, page tabs, Preview on, stage, inspector **sheet** (§3) |

## 2. The device fits the stage

Replace `DEVICE_MAX` with a fit: device = the largest box of the screen's aspect ratio that fits the stage minus a
16px padding (and minus the stage tag/caption). Minimum 200px on the long side. Region labels shrink with
`--fs-xs` under 320px.

## 3. Phone

- **Header**: **Pages & regions** + ×.
- **Page tabs**: one horizontally scrolling row (each tab ≥ 44px tall), with **+** at the end.
- **Preview on**: a full-width row under the tabs.
- **Stage**: fills the width; the device is fitted (§2). The mismatch banner stacks its button under the text.
- **Inspector sheet**, at the bottom over the stage:
  - **Peek**: 64px, showing the selection, **Page · Home** or **Region · Calendar**, plus a ⌃ chevron.
  - **Open**: 65% of the height, with a drag handle and the inspector content scrolling inside. The stage refits
    into the remaining height, so the selected region stays visible.
  - Selecting a region opens the sheet. Tapping the peek toggles it. Dragging the handle down, or tapping the
    stage's empty area, closes it to peek.
  - 200ms slide; none under reduced motion.
- `role="region"`, `aria-label="Inspector"`; the chevron is a button labelled **Show settings** / **Hide settings**.

## 4. Touch

- **Dividers** (`.sre-resizer`, `RegionNode` handles): on a coarse pointer, the hit area grows to 28px across, with a
  visible 4×34px grip centred in it. Pointer events already work with touch.
- **Clock bar**: on a coarse pointer, or in Compact/Phone, it isn't draggable and shows no drop zones. Tapping it
  selects **Clock bar** in the inspector, where **Position** (already in `ScreenInspector`) moves it. The tooltip
  "Drag to reposition the clock bar" changes to **Tap to change the clock bar**.

## 5. On-screen keyboard

The modal gets `dialog-above-osk`, so on a kiosk with the OSK open it shrinks to the space above the keyboard and
the size class re-evaluates (usually to Compact). The page-name field stays in view (`scrollIntoView` on focus,
`block: "nearest"`).

## 6. Tests (vitest)

- The size class comes from the modal size: 1280×720 Wide, 800×480 Compact, 390×844 Phone; the OSK height moves a
  kiosk from Wide to Compact.
- Device fit: the aspect ratio is kept, and it never overflows the stage at 390, 800 or 1280 widths; minimum 200px.
- Phone sheet: peek shows the selection; selecting a region opens it; the chevron toggles it; tapping empty stage
  closes it; reduced motion has no transition.
- Coarse pointer: the clock bar isn't draggable, a tap selects it, and Position moves it; the divider hit area is 28px.
- `dialog-above-osk` is applied.
