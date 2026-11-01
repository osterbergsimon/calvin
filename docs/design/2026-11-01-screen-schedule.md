# Screen on/off schedule: compact editor

Status: spec (owner request; after rc.1). Mockup: [mocks/schedule/schedule.html](mocks/schedule/schedule.html), PNG
`mocks/schedule/png/w1.png`. Frontend only. Replaces `DisplayScheduleGrid.vue` (used on the Default page and on
each screen's page).

## 1. Today

Seven day cards, always all open. Each card has a toggle, the day name, and two labelled time fields stacked
vertically. They sit in the right-hand control column of a `SettingRow` (260px wide), so the grid is **≈ 1,680px
tall** at both 1280 and 390. You scroll past it every time you visit Screens, and almost everyone uses the same
times every day.

## 2. Design

### 2.1 Collapsed by default: one row (mock W1, top)

The **Screen on/off schedule** row keeps its toggle. When it's on, the next row is:

- **Schedule**, with a summary in `--text-body`:
  - **On 06:00 · off 22:00, every day**;
  - **Weekdays 06:00–22:00 · weekends 08:00–23:00**;
  - **Different each day** (+ **Off on Sundays** when a day is off);
- a **Change** button (`Button secondary sm`) on the right.

That's one 56px row instead of 1,680px. The scope line ("Same as Default" / "Changed here · Reset to default") stays
under the summary on screen pages.

### 2.2 Editing (mock W1, below)

**Change** expands an editor in place, below the row: a full-width `SettingGroup` inside the panel, not the narrow
control column.

1. **How it repeats**: `SegmentedControl` **Every day · Weekdays and weekends · Each day**.
2. Then one compact table. Columns: day label · **On** · **Off**. The column headers appear once (`--text-meta`,
   `--ink-2`), never per row.
   - Every day: 1 row, **Every day**.
   - Weekdays and weekends: 2 rows, **Mon–Fri** and **Sat–Sun**.
   - Each day: 7 rows, **Mon** … **Sun** (week order follows **Week starts on**).
3. A row is `--touch-target` tall:
   - the day label (`--text-label`, 4.5rem wide);
   - two `TextField type="time"` (`step` 900, i.e. 15-minute steps; `--control-height`; no per-field label; the
     accessible name is "Monday on" / "Monday off");
   - a `ToggleSwitch` on the right, accessible name **Screen on, Monday**. Off hides the two times and the row reads
     **Off all day** in `--ink-3`.
4. **Done** (`Button secondary sm`) collapses back to the summary. Changes save as you go (existing autosave), so
   Done only closes.

**Doctrine blocks only, with no `<style>` in the feature:**
- `SettingRow` for the summary row (label, summary as description, `Button` as control);
- `SettingGroup` for the editor;
- `SegmentedControl`, `TextField`, `ToggleSwitch`, `Button`, and `InlineNote` for the error;
- the table is a **new block, `ui/FieldTable.vue`**: rows of label + controls, one header row, `--gap-inline`
  between cells, `--touch-target` rows, `--text-meta` headers, stacking to label-over-controls under 360px. It gets a
  gallery entry and leaves `DisplayScheduleGrid.vue` off the `settingsNoStyle` / `controlLint` allowlists. Any later
  "same fields per row" editor reuses it.

Heights: Every day ≈ 150px, Weekdays and weekends ≈ 200px, Each day ≈ 420px. All full width, so the phone shows the
same table: day 4.5rem + two 7rem time fields fit 390px.

### 2.3 Mode from data (no new config)

The stored schedule stays the 7-day array (`{ day, enabled, onTime, offTime }`). The mode is **inferred**:
- all 7 enabled with the same times → Every day;
- Mon–Fri equal and Sat–Sun equal (and both groups enabled or both off) → Weekdays and weekends;
- otherwise → Each day.

Switching mode writes the array:
- **Every day** copies the first row to all 7;
- **Weekdays and weekends** copies Mon to Mon–Fri and Sat to Sat–Sun;
- **Each day** keeps the current values.

Editing a grouped row writes all days in its group.

### 2.4 Where it lives

The same component on the Default page (§ Power) and on each screen's page. On a screen page the whole schedule is
one override (as today): **Changed here · Reset to default** under the summary resets all 7 days.

## 3. Copy

- Row label **Schedule**; summary as in §2.1, using the user's time format (12h/24h).
- Segments **Every day · Weekdays and weekends · Each day**.
- Column headers **On** · **Off**; the row toggle is named **Screen on, {day}**.
- An invalid range (off equal to on) gives the row an `InlineNote` err: **On and off can't be the same time.**
- Off earlier than on means overnight. It's allowed and the summary says so: **On 22:00 · off 06:00 the next day**.

## 4. Other sections that need the same treatment

Measured with the mocked harness at 1280 (section heights):

| Section | Height | Problem | Fix |
|---|---|---|---|
| Dashboard › **Clock bar layout** | **1,062px** | For both bar shapes: 3 sliders each, stacked under Title Case labels ("Time Font Size", "Bar Padding", "Plugin Item Size") and only half-width, plus a preview | Per bar: **Size** `SegmentedControl` **Small · Medium · Large · Custom** (presets write the 3 values). **Custom** opens a `SettingGroup` with three `SettingRow`s (**Time**, **Padding**, **Plugin info**: label left, `RangeSlider` right, value in px). One shared live preview under the section. Collapsed ≈ 250px |
| Screens › **Touch & keyboard** | 618px | every row stacks its control under the text even at 1280; the label "Show it" lost its context | rows go side by side at ≥ 600px (§ below); "Show it" becomes **On-screen keyboard**; only **Also switch to** (6 chips) stays stacked. ≈ 380px |
| Dashboard › **Focus & remote** | 884px | (1) three per-screen rows (**Photo frame**, **Loading light**, **Layout**) sit in a Dashboard section, while every other per-screen setting lives on the screen pages; (2) their descriptions render in `--text-body`, larger than every other description | move those three to Screens › Default / each screen, in a new section **Behaviour** (they carry "Same as Default" already); descriptions use `--text-meta`. Focus & remote keeps Focus light, Dim, Dashboard size and the button rows. ≈ 450px |
| Screens list (875px), Content › Photos (794px) | | content-driven (cards, sources) | fine |

**SettingRow rule (doctrine §4 row anatomy, clarified):**
- side by side at ≥ 600px for any control up to 50% of the row width;
- stacked only on phone, or for wide controls (chip groups, tables, sliders with a preview), via `:stacked`;
- never stacked just because the description is long: the description wraps in the left column instead;
- a height guard e2e (mocked harness) fails if a single `SettingRow` with a toggle, segmented control or select is
  taller than 120px at 1280.

## 5. Tests (vitest)

- Collapsed summary for each of the three shapes, plus "Off on Sundays"; 12h formatting.
- Mode inference from arrays (equal times, weekday/weekend split, mixed).
- Mode switching writes the array as in §2.3; editing a grouped row updates its whole group.
- Change expands the editor; Done collapses; the editor is full width; one header row only.
- Turning a day's toggle off hides its times and saves `enabled: false`.
- `FieldTable` unit tests + gallery entry; `DisplayScheduleGrid` removed from the lint allowlists.
- Same-time error; overnight summary.
- Screen page: Reset to default clears the schedule override.
- Height guard (e2e, mocked harness): the collapsed Power section is ≤ 260px tall at 1280 and 390.
