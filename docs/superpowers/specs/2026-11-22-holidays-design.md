# Highlight holidays: server design (calvin-xlyk)

Status: **proposal, awaiting the owner's approval.** It goes with the design lead's UI spec
[docs/design/2026-11-22-holidays.md](../../design/2026-11-22-holidays.md). Nothing is built until the owner
approves the direction there (its §1 and §9).

## Why

Settings has a "Highlight holidays" choice (`showRedDays`), but nothing acts on it: `isRedDay()` in
`CalendarView.vue` always returns `false`, and Calvin has no holiday data. A family wall calendar should show
public holidays the way a printed one does, with no setup beyond choosing a country.

## Goals, non-goals, anti-goals

- **Goals:** one household choice (country, and an optional region) shows the public holidays on every calendar
  view, with their names. It works offline, and the dates are correct for the chosen region.
- **Non-goals:** school holidays, name days, flag days, custom or personal days (an ICS calendar source already
  covers those), and per-screen holiday choices.
- **Anti-goals:** a call to any outside service, a dependency that needs a network or a native build on the Pi,
  and a holiday shown as an event.

## Approaches

1. **Offline library on the server (chosen).** The Python [`holidays`](https://pypi.org/project/holidays/)
   package is pure Python, MIT-licensed, covers about 150 countries and their subdivisions, and computes dates
   for any year with no data files to update. The frontend asks the server for a date range.
2. **A public-holidays ICS calendar source.** This needs no new code, but the person has to find and add a feed,
   holidays show as events (an anti-goal), and the result depends on someone else's server.
3. **A holiday list in the browser** (a JS library). It would duplicate the data on every screen, and the UI
   spec forbids browser-side fetching (its §6).

Approach 1 is the only one that matches "pick a country and it works".

## Design

### 1. The config keys

- `holidaysCountry`: an ISO 3166-1 alpha-2 code that `holidays.list_supported_countries()` lists, or `null`
  (off). This is the default.
- `holidaysRegion`: one of that country's subdivision codes, or `null` (the whole country).
- Both are household keys only, in `ConfigUpdate` with validation: an unknown country gives 422, and a region
  that the country does not list gives 422. Setting the country clears the region unless the same write also
  sends a valid region. Both get the usual snake-case aliases, like the other keys.
- `showRedDays` / `show_red_days` is retired. It is dropped from the defaults, the schema and `configRegistry.js`,
  and a stored value is ignored and removed on the next config write. There is nothing to migrate (UI spec §5).
- Backup and restore carry the two keys as part of the config, with no special handling.

### 2. The routes (new `backend/app/api/routes/holidays.py`)

- `GET /api/holidays/countries` returns `[{code, name, regions: [{code, name}]}]`, sorted by name.
  - `name` is the English country name. The package's country classes carry it (for example `holidays.Sweden`
    for `SE`); a small static map in the module covers any gap, and the code is the last fallback.
  - Regions are the package's subdivisions, with their names where it has them (`subdivisions_aliases` or the
    code).
  - The answer is built once per process and cached.
- `GET /api/holidays?start=YYYY-MM-DD&end=YYYY-MM-DD` returns `[{date, name}]` for the household's
  `holidaysCountry` and `holidaysRegion`, inclusive of both ends.
  - When the country is `null`, it returns `[]`.
  - The range is limited to 400 days, which covers the rolling month and a full year. A longer range, a bad date or `end` before `start` gives 400.
  - Two holidays on one date come back as two entries.
  - Names use the package's English (`language="en_US"`) when the country supports it, and otherwise its default
    language. That follows the UI spec's open question 2; if the owner chooses the country's own language, the
    only change is to drop the `language` argument.
- Both routes are read-only and use the same access as the calendar routes (whatever `GET /api/calendar/*`
  allows today), because the wall screens read them. They return no personal data.
- Dates are plain calendar dates. A holiday is a date, not an instant, so the household time zone matters only
  for the frontend's "today". The server does no time-zone conversion.

### 3. The dependency

- Add `holidays` to `backend/pyproject.toml` dependencies, pinned to a minor range (for example
  `holidays>=0.60,<1`), and lock it with `uv lock`. It is pure Python, so it installs on the Pi (arm64 and
  arm/v7) with no build step. Check the runtime image size change in the PR (expected to be a few MB).
- The package's licence is MIT, which is compatible with Calvin's licence direction.

### 4. Tests

- Unit tests for the country list (sorted, a known country with regions, a known one without regions) and for the
  date range (a known fixed holiday such as 25 December for SE, a region-only holiday, two holidays on one date,
  `null` country gives `[]`, and a range over 400 days or a reversed range gives 400).
- Config tests: validation (unknown country 422, a region not in the country 422, a country change clears the
  region), the snake-case aliases, and the retirement of `showRedDays`.
- The OpenAPI snapshot and `frontend/src/api/types.ts` are updated.

## Left to the builder

- Where the English country names come from, if the package does not give them (a small static map in the module
  is fine).
- The cache shape for the country list.

## Build order

Part A is the server (this document), Part B is the UI (the design lead's spec). Part B needs Part A merged first.
Each part has its own PR, review and checks, like the screen power mode work (calvin-25g9).
