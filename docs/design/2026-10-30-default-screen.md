# Default is a screen

Status: spec (owner agreed 2026-10-30). Frontend only. Follow-up to
[2026-10-30-screens-and-kiosks-setup.md](2026-10-30-screens-and-kiosks-setup.md) (built in #165).

## 1. Decision

The **All screens** card and the loose **All screens · Display / Power / Touch & keyboard** sections go away. In their
place is a **Default** screen, edited on the same page as any other screen.
- Screens **follow** Default for every setting they haven't changed (live, as today; not copied at creation).
- A new screen follows Default from the moment it connects, so it picks up whatever Default says now.
- Any browser that isn't a set-up screen (a phone, a laptop) also uses Default.

## 2. Screens category

Only the list remains (plus **Kiosk software** and **+ Add a screen**, unchanged):
- **Default** card first, solid border, no online dot:
  - title **Default**;
  - line 1: **Used by new screens and by browsers that aren't set up as a screen**;
  - line 2: **Landscape · off 23:00–06:30 · keyboard Auto**, plus **· 2 screens have their own settings** when any
    do (a count of screens with ≥ 1 override, not of settings).
- Then one card per screen, as today, with an extra line when it has overrides: **3 settings changed**.
- **This browser** card, last, only on a browser that isn't a set-up screen (`!getKioskId()`):
  - title **This browser**;
  - line **{n} settings just for this browser** or **Same as Default**.
  It replaces the **This screen** chip rows that sat in the All screens sections.

## 3. The Default page

The same component and sections as a screen page (#165), opened from the Default card:
- **Name** → **Room name** for browsers that aren't a screen (the global `displayName`). Description **Shown in the
  clock bar of any browser that isn't set up as a screen.**
- **Pages**: which pages browsers and new screens show, and the start page (the global `availableScreens` /
  `defaultScreenId`). **Edit pages** opens the editor previewing **Any browser**.
- **Display**, **Power**, **Touch & keyboard**: today's All-screens rows, unchanged.
- **Default-only rows**, with no per-screen override, marked by a `--fs-xs` `--ink-3` line **Applies to every screen**:
  Timezone, Reboot button combo, Keyboard layout (each device can still pick its own layout on the keyboard, CLV-21),
  Also switch to.
- No **Software** section, no status header, and no reset links (it is the default).
- **Screen now** (turn this screen on/off now) leaves Settings › Screens entirely. It calls
  `/system/display/power/*`, which drives the **server's** own display, so it moves to **System › Restart** as **This
  server's screen** with **Turn off · Turn on**. It's shown only when `/system/environment` reports
  `capabilities.reboot` (host control) and the deployment has a display.

## 4. A screen page

- Per row: **Same as Default** (`--ink-3`), or **Changed here** (`--ink`, 600) · **Reset to default** (text button;
  removes that override). This replaces "Same as all screens" / "Only this screen" / "Use the shared setting".
- Page footer, when the screen has any override:
  - **Reset everything to default** (`.btn`). Confirm: **Reset Hallway to the default?** / **Its 3 changed
    settings go back to the default. Its name stays.** / **Reset** / **Cancel**. Removes every override key except
    `displayName`.
  - **Use these as the default** (`.btn`, ghost). Confirm: **Make Hallway's settings the default?** / **Default and
    every screen that follows it will use Hallway's {list of changed settings}.** / **Make default**. It writes the
    override values into the global config, then removes them from Hallway (it now matches Default). Name and pages
    are not copied.

## 5. Editing Default when screens differ

When a Default row changes and some screens override that same key, an inline note appears under the row for 10s
(and until dismissed):
- **Hallway keeps its own Orientation.**, or with several, **Hallway and Kitchen keep their own Orientation.**;
- text button **Change them too**, which removes that key's override on those screens.

No note when no screen overrides the key.

## 6. This browser page

Opened from the **This browser** card. Only the per-browser rows (the settings audit §2 and CLV-27 storage):
- Touchscreen;
- On-screen keyboard (with the CLV-27 learned state and **Show it again**);
- Settings text size, which is listed here too (its row stays in Dashboard, where it's found by size).

Each uses **Same as Default** / **Changed here · Reset to default** like a screen.

## 7. Words

"All screens", "Same as all screens", "Only this screen" and "Use the shared setting" are gone. The words are
**Default**, **Same as Default**, **Changed here** and **Reset to default**. Search keywords for the Default page:
"all screens", "default", "shared".

## 8. Tests (vitest)

- The Screens list shows Default first with the override summary, screen cards with "{n} settings changed", and This
  browser only without a kiosk id.
- The Default page has the screen-page sections; default-only rows show "Applies to every screen"; no Software or
  reset links; Edit pages previews Any browser.
- Screen page: "Same as Default" / "Changed here · Reset to default"; Reset everything removes all overrides except
  `displayName` after the confirm.
- **Use these as the default**: writes the overridden values globally, clears them on that screen, leaves name and
  pages alone.
- Editing a Default key that screens override shows the note with their names; **Change them too** removes those
  overrides; no note when nobody overrides it.
- **Screen now** is gone from Screens and appears in System only with host control; it calls
  `/system/display/power/*`.
- Old deep links to the All-screens destinations (`device-power`, `device-keyboard`, `layout`) open the Default page
  at that section.
