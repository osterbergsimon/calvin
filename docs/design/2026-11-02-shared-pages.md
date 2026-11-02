# Pages are shared: say so, and stop new pages leaking onto every screen

Status: spec (owner request calvin-m4rg, "bad UX"; rc.2, builds after rc.1). No mockup yet. Mostly frontend. No
config-shape change: it keeps `dashboardScreens`, the global `availableScreens` / `defaultScreenId`, and the
per-screen overrides of the same keys. Read together with [region swap](2026-11-02-region-swap.md) (#276).

## 1. Today

- `config.dashboardScreens` is **one catalog** for the household. A screen chooses which pages it shows:
  - Default's **Pages shown** (global `availableScreens`; `null` means all) applies to browsers and to every screen
    that follows Default.
  - A screen's own **Pages shown** (override `availableScreens`) replaces that list.
- **Add page** in Pages & regions always adds to the catalog. Opened from the Kitchen screen, the new page still
  shows up on every screen that is on "all", and in every browser. Nothing in the UI says pages are shared, so a
  page added "on the Kitchen" appearing in the hallway reads as a bug.
- **Bug: the UI ignores Default's list for screens that follow Default.** A screen with no `availableScreens`
  override really shows Default's list (backend `merge_overrides`). But three places treat "no override" as **all
  pages**:
  - `ScreensSettings.effAvailable` (the screen page's toggles);
  - `ScreenRegionEditor.kioskShowsPage` (tab meta, dimming, the mismatch banner);
  - `showItOnScreen`, which then says "already shown" and saves nothing.
  If Default hides a page, these screens' toggles show it on, while the screen itself doesn't show it.

## 2. Decision: one shared catalog, made honest

Keep option 1. Do not move to per-screen pages.

- **Shared is what households want.** The family calendar page on the kitchen and the hallway is one page, and a
  change should land on both. Per-screen copies drift. Then "fix the font on both" turns into two edits, and
  Default-as-template raises a question with no good answer: does a template edit reach the copies?
- It matches the Screens/Default model the rest of Settings already uses: one thing, followed live, changed
  in one place.
- It's cheap. Option 2 changes the data model, needs a migration, and makes the kiosk agent read per-screen layouts.
  What's broken today is the UI, not the model.

What changes: **where a new page shows**, **saying which screens a page is on**, and **two kinds of delete**.

## 3. Scope: the editor works "for" the Preview on target

Pages & regions already has **Preview on** (a screen, or Any browser). That target is now also the editor's
**scope**: the screen (or Default) that new pages are added to, and that "Hide" acts on.

- Opened from a screen's page, or on a kiosk: scope = that screen (today's preselection).
- Opened from Default: scope = **Default**. Rename the **Any browser** option to **Browsers & new screens** so it
  matches Default's copy ("The pages browsers and new screens show.").

## 4. Flows

Everything below runs in the editor. It saves the same way **Show it on…** already does: for a screen, GET its
overrides, merge, then PUT; for Default, patch the global config.

### 4.1 Add (and Duplicate)

| Scope | Catalog | Default's list | Scope's list | Other screens |
|---|---|---|---|---|
| A screen (Kitchen) | page added | if `null` (all), it is **pinned** to the pages that existed before, so the new page does not join it | Kitchen gets an override = its current effective list + the new page | unchanged: screens on Default don't gain it (Default is pinned); screens with their own list never did |
| Default | page added | if `null`, it stays `null` (gains it); otherwise the new page is appended | — | screens that follow Default gain it; screens with their own list don't |

- Pinning Default's list doesn't change what anything shows; it only stops "all" from absorbing the newcomer.
  Default's page then lists the new page switched **off**, which is the truth.
- When Kitchen was following Default, it now has its own list. Its page shows **Changed here · Reset to default**,
  as for any other override. Reset brings back Default's list and drops the new page from Kitchen. That's correct,
  and the ScopeLine already explains it.
- After the add, the Page inspector shows an `InlineNote` (tone ok) under **Shown on** (§4.2): **Shown on Kitchen
  only.** with an **Also show on…** action that opens the same popover as **Change…**.

### 4.2 Shown on (the page's scope, always visible)

There's a new row at the top of the Page inspector, under **Page name**:

```
Shown on   Kitchen, Hallway · browsers        [ Change… ]
```

- The summary uses the existing `screensLine` (fixed per §1): screen labels, and **browsers** when Default shows the
  page. It reads **All screens** when every screen and Default show it, and **Not shown anywhere** (tone warn) when
  none do.
- **Change…** opens a `Popover` with a `ToggleSwitch` row per screen, plus one for **Browsers & new screens**
  (Default). Each switch writes that target's list, using the same rule as the screen pages' toggles: all on drops
  the override, and turning off the last page is refused with **Pick at least one page.**
  - A screen that follows Default and gets toggled becomes **Changed here**, and its row says so in its meta.
- This replaces nothing: the mismatch banner (**Kitchen doesn't show "X". Show it on Kitchen**) stays as the fast
  path.

### 4.3 Edit (layout, regions, swap, Shows, clock bar)

- An edit changes the page everywhere it shows. **No confirm**: the Shown on row already says where.
- When the page shows on more than the scope, the wide subtitle names it (§5). This covers the #276 actions too:
  a swap or a Shows change on a page that both kitchen and hallway show changes both. That is intended.

### 4.4 Rename

- The name is shared. Renaming happens in place, with no confirm.
- The Page name field gets the description **Every screen that shows this page uses this name.**, but only when
  Shown on lists more than one target.

### 4.5 Remove: Hide here vs Delete everywhere

**Delete page** becomes two actions in the Page inspector:

| Action | Shown when | What it does |
|---|---|---|
| **Hide on Kitchen** (secondary) | scope is a screen that shows the page, and that screen shows ≥ 2 pages | Removes the page from Kitchen's list. Catalog untouched. Copy for Default scope: **Hide from browsers & new screens** |
| **Delete page** (danger) | always (disabled on the last page in the catalog, as today) | Removes the page from the catalog **and from every list** |

**Delete page** confirms only when someone else is affected: when the page shows anywhere other than the scope. The
confirm is a `Dialog size="sm"`:

> **Delete "Photos" everywhere?**
> Hallway and browsers also show it. To take it off Kitchen only, use Hide on Kitchen.
> [Cancel] [Hide on Kitchen] [Delete page]

Cleanup on delete:
- Strip the id from Default's list and from every screen's override.
- If a screen's list would become empty, drop that override, so the screen follows Default again.
- A `defaultScreenId` (start page) that pointed at it is dropped, so that target falls back to its first page.
- Screens that are offline get the cleanup on their next override fetch, because the lists live on the server.

## 5. Copy

| Where | Today | New |
|---|---|---|
| Editor subtitle (wide) | Design the pages your screens display · drag dividers to resize, the clock bar to reposition · changes apply live | **Pages are shared by your screens · changes apply live everywhere they show** |
| Editor stage caption (wide, under the device) | — | **Drag regions to swap them, dividers to resize, the clock bar to reposition** (the gesture line moves here; this supersedes #276 §5's subtitle copy) |
| Preview on option | Any browser | **Browsers & new screens** |
| Screen page → Pages section description | — | **Pages are shared by all screens. Choose which ones this screen shows.** |
| Screen page → each page row meta | Not shown here (when off) | When on: **Also on Hallway** / **Only here**. When off: **Not shown here** |
| Default page → Pages shown description | The pages browsers and new screens show. | **The pages browsers and screens that follow Default show. Pages are shared by all screens.** |
| Page inspector | Delete page | **Shown on** row (§4.2), **Hide on {scope}**, **Delete page** |

Phone: the subtitle and stage caption are hidden, as now. The Shown on row in the sheet carries the scope.

## 6. Build notes

- One helper `effectivePages(target, config, catalog)` in `utils/screenOverrides.js`. It is a pure function: given
  the override list, else Default's list, else all pages. It replaces the three wrong fallbacks in §1. Add a unit
  test for each fallback level.
- `addScreen` / `duplicateScreen` take the scope and return the catalog patch plus the list patches (§4.1). Save
  the catalog first, then the lists. If a list save fails, show the existing **Couldn't update {screen}. Try again.**
  note. The page exists either way, and Shown on shows the real state.
- Tests:
  - add from a screen with Default `null` pins Default and gives only that screen the page;
  - add from Default with `null` keeps `null`;
  - a screen that follows Default and has Default hiding a page shows that page's toggle off (regression for §1);
  - Hide vs Delete, including the empty-list and start-page cleanup;
  - the Delete confirm only when others are affected;
  - e2e (mocked harness): open the editor from a screen, add a page, check that Default's page lists it off.

## 7. Not doing

- Per-screen page copies or Default-as-template (option 2).
- A "Make a copy for this screen only" action. **Duplicate** + **Hide** already does that in two taps. Revisit if
  the owner asks.
