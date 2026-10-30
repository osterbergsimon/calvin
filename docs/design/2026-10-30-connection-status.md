# Connection status on the dashboard

Status: spec. Mockup: [mocks/connection/connection.html](mocks/connection/connection.html), PNG
`mocks/connection/png/n1.png`. Frontend only.

## 1. Today

- `BarActionCluster.vue` shows two indicators side by side:
  - `ConnectionIndicator` ("📡 Offline" / "⚠️ No Connection");
  - a status dot reading "Checking..." / "Healthy" / "Error", titled "Backend: …".
  When the server is down, both show at once.
- The only explanation is a `title` tooltip ("Backend server unreachable. Using cached data."). Touch screens never
  show it.
- `navigator.onLine === false` is reported as "No internet connection". But Calvin runs on the LAN: the screen is off
  the *network*, and the internet may be fine.
- Nothing says how old the shown data is. `lastBackendCheck` already holds the last successful check, so the data
  for this exists.
- One failed `/api/health` check (3s timeout, every 30s) flips the state, so a single slow response makes it flicker.
- The cluster lives in the clock bar. With controls hidden and **Keep the clock bar when hidden** off, an offline wall
  screen shows no sign at all.

## 2. One indicator: `ConnectionStatus.vue`

It replaces `ConnectionIndicator` and the status dot in `BarActionCluster`. The "Healthy" dot is removed: when things
work, nothing shows.

**States** (from `connection` store):

| State | Rule | Shows |
|---|---|---|
| OK | backend reachable | nothing |
| Starting | no check finished yet | nothing for the first 5s; then **Connecting…** (`--ink-2`, no icon) |
| Server unreachable | **2 consecutive** failed checks | pill **Can't reach Calvin · data from {time}** |
| Screen offline | `navigator.onLine === false` | pill **No network · data from {time}** (immediately, no debounce) |
| Back | the first success after an unreachable/offline state | **✓ Connected** (`--ok`) for 3s, then nothing |

- `{time}` = `lastBackendCheck` as HH:MM (12/24h per **Time format**). Not today → **Tue 14:02**. Older than 6 days → **12 Oct**.
  With no successful check yet this load, the pill drops the "· data from" part.
- **Retry backoff** after a failure: 5s, 10s, 30s, then every 30s (today: always 30s). Coming back from
  `navigator.onLine` false triggers an immediate check.

**Look:** pill, height 32px (28px on a vertical clock bar, which shows the icon only plus the time below it),
padding 0 12px, `--bg-1`, 1px `color-mix(in srgb, var(--warn) 55%, var(--line))`, `--radius-pill`.
`mdiCloudOffOutline` (unreachable) or `mdiLanDisconnect` (offline) at 16px in `--warn`, then the text in
`--fs-sm` `--ink`. It's `--warn`, not `--err`: a wall display shouldn't shout, and the data is still shown.

## 3. Tap to explain

The pill is a `<button>`. Tapping it opens a small popover anchored to it (20rem; `--bg-1`, 1px `--line`, radius 12px,
shadow as the welcome card):

- Unreachable:
  - Title **Can't reach Calvin**.
  - **This screen is showing what it last got at {time}. It keeps trying on its own.**
  - **Check that the Calvin server is on and that this screen is on the same network.**
  - Button **Try now**: runs `checkBackend()`, shows **Checking…** while it runs; on failure, **Still can't reach it.**
- Offline:
  - Title **This screen is offline**.
  - **It isn't connected to the network. Check its Wi-Fi or cable.**
  - **Showing what it last got at {time}.**
  - **Try now**, as above.
- The popover closes on Escape, an outside tap, or reconnecting (which then shows **✓ Connected**). Targets ≥ 44px.

## 4. Where it shows

- In the clock bar, at the same spot as today's cluster.
- **When the clock bar isn't visible** (hidden with the controls, or a page without one): a floating pill, fixed
  16px from the bottom-left corner (top-left if the show-controls corner is bottom-left), only while not OK. It
  ignores **Hide controls**: this is status, not chrome (like the CLV-20 welcome card).
- Settings keeps its own save-status pill and is out of scope.

## 5. Accessibility

- A visually hidden `role="status"` `aria-live="polite"` line announces changes: **Can't reach Calvin.** /
  **This screen is offline.** / **Connected again.**
- The pill's name is its visible text. The popover is `role="dialog"` `aria-labelledby` its title; focus moves to
  **Try now** and returns to the pill on close.
- Meaning isn't carried by colour alone: icon + words.
- No words "backend", "healthy", "error" or "internet".

## 6. Tests (vitest)

- OK shows nothing; Starting shows nothing until 5s, then Connecting….
- One failed check shows nothing; two show the unreachable pill with the time of the last success; backoff runs 5s,
  10s, 30s, 30s.
- `offline` event → offline pill immediately; `online` → immediate check.
- Back → **✓ Connected** for 3s, then nothing.
- Time format: today HH:MM in 12h/24h; another day "Tue 14:02"; over 6 days "12 Oct"; no success yet → no
  "data from".
- Popover: copy per state; Try now calls `checkBackend` and shows its outcome; Escape and outside tap close it; it
  closes on reconnect.
- With the clock bar hidden, the floating pill shows only while not OK, and avoids the show-controls corner.
- No "Healthy"/"Backend"/"No internet" text is rendered.
