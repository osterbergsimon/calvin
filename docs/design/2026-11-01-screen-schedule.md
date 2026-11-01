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
3. A row is 48px: the day label (`--text-label`, 4.5rem wide), then two `TextField type="time"` (`step` 900, i.e.
   15-minute steps, `--control-height`, no per-field label; the accessible name is "Monday on" / "Monday off"), then
   a **Screen off all day** check on the right (P3 native checkbox with `accent-color: var(--focus)` until a
   shared checkbox exists). When checked, the two times hide and the row reads **Off all day** in `--ink-3`.
4. **Done** (`Button secondary sm`) collapses back to the summary. Changes save as you go (existing autosave), so
   Done only closes.

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
- Column headers **On** · **Off**; check **Screen off all day**.
- An invalid range (off equal to on) gives the row an `InlineNote` err: **On and off can't be the same time.**
- Off earlier than on means overnight. It's allowed and the summary says so: **On 22:00 · off 06:00 the next day**.

## 4. Tests (vitest)

- Collapsed summary for each of the three shapes, plus "Off on Sundays"; 12h formatting.
- Mode inference from arrays (equal times, weekday/weekend split, mixed).
- Mode switching writes the array as in §2.3; editing a grouped row updates its whole group.
- Change expands the editor; Done collapses; the editor is full width; one header row only.
- Screen off all day hides the times and saves `enabled: false`.
- Same-time error; overnight summary.
- Screen page: Reset to default clears the schedule override.
- Height guard (e2e, mocked harness): the collapsed Power section is ≤ 260px tall at 1280 and 390.
