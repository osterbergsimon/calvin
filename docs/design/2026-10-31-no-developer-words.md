# No developer words in the UI (CLV-63)

Status: spec (release prep, epic calvin-354a). Frontend copy only, plus one small helper. Rules from
[2026-10-30-settings-copy-audit.md](2026-10-30-settings-copy-audit.md) §5:
- say **screen**, **page**, **source**, **plugin**, **Calvin** (for the server);
- never "backend", "frontend", "API", "instance", "config", "branch", "schema", "Healthy";
- no raw error text on the dashboard.

Paths are under `frontend/src/`. "→ remove" means delete the element. Build after CLV-64 (theme tokens).

## 1. Raw errors (fix once, everywhere)

Today raw `err.message` / `response.data.detail` reaches the screen. On the wall that means "Network Error" or
"Request failed with status code 500". Where: `stores/images.js`, `calendar.js`, `webServices.js`, `config.js`,
`keyboard.js` (`error.value = err.message`), shown in `PhotoSlideshow.vue:23`; also `WebComponentHost.vue:56`,
`ClockBarItemsTab.vue:110`, `SecuritySettings.vue:105/145`, `useConfigForm.js:241`.

**New helper** `utils/friendlyError.js`: `friendlyError(err, action)` → one sentence:

| Case | Text |
|---|---|
| no response (network) | **Couldn't reach Calvin. Check that it's running and on the same network.** |
| 401/403 | **You need to sign in as admin to {action}.** |
| 404 | **That's no longer there. Reload and try again.** |
| 409 | **That conflicts with an existing one.** (callers may pass a specific line) |
| 422/400 with a string `detail` written for people (backend validation messages) | that `detail` |
| 5xx / anything else | **Something went wrong on the Calvin server while trying to {action}.** |

- Stores keep the raw error for logs (`logError`) and expose `errorText` from `friendlyError`.
- **On the dashboard, no error text at all**: offline/stale states use the CLV-20 empty states and the
  `ConnectionStatus` pill (#172). Remove `PhotoSlideshow.vue:23-24` (`{{ imagesStore.error }}`).
- In Settings, a raw detail may appear only behind a **Details** disclosure (`--fs-xs`, `--font-data`, `--ink-3`)
  under the friendly line. Same for `UpdatesTab.vue:69, 117`.

## 2. String table

### System › Updates (`components/settings/tabs/system/UpdatesTab.vue`, `UpdateSourceRows.vue`)

| Where | Now | New |
|---|---|---|
| Status row description | Live backend and updater state. | **Whether Calvin is running and if an update is under way.** |
| Status row label | Backend API · {Healthy/…} | **Calvin** · **Running** / **Not responding** / **Checking…** |
| Status row label | Update state · {raw status} | **Updates** · **Up to date** / **Updating** / **Update failed** / **Not checked yet** (map statuses; never print the raw value) |
| Status row | {formatPhase(phase)} (title-cased raw phase) | phases map: pulling → **Downloading**, deps/installing → **Installing**, building → **Preparing the screens**, restarting → **Restarting**; unknown → hide |
| Status fallback | Unknown | **Not checked yet** |
| Install updates description | Pull and apply the latest version from the selected branch. | **Download and install the latest Calvin.** |
| Docker "How to update" | Calvin runs in a Docker container, so it is updated from the host by pulling a new image. | **Calvin runs in Docker, so you update it there: pull the new image and restart the container.** (keep the command block; it's for the person running Docker) |
| Advanced › Repository | Repository / GitHub repository to pull updates from. / aria Git repository URL | **Update source** / **Where Calvin downloads updates from. Leave as is unless you run your own copy.** / aria **Update source address** |
| Advanced › Branch | Branch / Which branch to track. / aria Git branch | **Release channel** / **Which line of updates to follow.** / aria **Release channel** |

### System messages (`composables/useSystem.js`, shown as "System" toasts)

| Line | Now | New |
|---|---|---|
| 143 | Restarting backend… | **Restarting Calvin…** |
| 151 | Failed to restart backend (+detail) | `friendlyError(err, "restart Calvin")` |
| 159 | Backend restarting — waiting for it to come back… | **Calvin is restarting. This takes about 15 seconds.** |
| 164 | Backend restarted successfully! Reloading… | **Calvin is back. Reloading…** |
| 169 | Backend not responding after restart. Check the service manually. | **Calvin hasn't come back yet. If it stays down, restart the machine it runs on.** |
| 177/190 | Restarting frontend… / Frontend restarting — waiting… | **Restarting this screen…** |
| 183 | Failed to restart frontend | `friendlyError(err, "restart this screen")` |
| 195 | Frontend restarted successfully! Reloading… | **Reloading…** |
| 200 | Frontend not responding after restart. Check the service manually. | **This screen hasn't come back. Turn it off and on again.** |
| 225 | Pulling latest code... | **Downloading the update…** |
| 227 | Updating dependencies... | **Installing…** |
| 232 | Building frontend... (this may take a few minutes) | **Preparing the screens. This can take a few minutes.** |
| 234 | Restarting services... | **Restarting Calvin…** |
| 278 | Update started... | **Update started.** |
| 289 | Update complete. Waiting for backend to come back… | **Update installed. Waiting for Calvin to restart…** |
| 293 | Update completed successfully! | **Calvin is up to date.** |
| 297 | Update completed, but backend is not responding yet. Please wait or check logs. | **Update installed, but Calvin hasn't restarted yet. Give it a minute.** |
| 301 | Update failed: {message or "Check logs for details."} | **The update didn't finish. Calvin is still on the previous version.** (+ Details in System) |
| 305 | Update is taking longer than expected. Please check logs or try again later. | **The update is taking longer than usual. Leave it running and check back later.** |

### System › Restart & versions (`categories/MaintenanceSettings.vue`)

| Now | New |
|---|---|
| Restart kiosk browser / Restarts the browser on this Pi's screen. The server keeps running. | **Restart this screen** / **Reloads this screen's browser. Calvin keeps running.** |
| To restart the server, restart the Calvin container from Docker (Unraid: Docker tab). | **To restart Calvin, restart its container in Docker (on Unraid: the Docker tab).** |
| Version · Unknown | **Version · Not available** |

### Dashboard (wall screen)

| Where | Now | New |
|---|---|---|
| `service/ServiceViewer.vue:23-24` | This service can't be shown. / Its plugin doesn't declare a display schema — update the plugin. | **This can't be shown here.** / **Its plugin needs an update.** |
| `plugins/WebComponentHost.vue:4` | Couldn't load this plugin's display. {raw error} | **Couldn't show {plugin name}.** (no raw text; log it) |
| `plugins/WebComponentHost.vue:42` | throw "schema.element missing" | keep as the log message only; never rendered |
| `PhotoSlideshow.vue:23-24` | {imagesStore.error} | → remove (§1) |
| `NotificationSystem.vue:194` | action label fallback "Unknown" | **Button pressed** |

### Screens (`categories/ScreensSettings.vue`, `shared/KioskStatusHeader.vue`)

| Now | New |
|---|---|
| Hardware config · Not yet reported | **Display settings · Not confirmed yet** |
| Hardware config · Pending (applies shortly) | **Display settings · Applying…** |
| Hardware config · Pending — applies when this kiosk reconnects | **Display settings · Applies when this screen comes back online** |
| Hardware config ✓ Applied | **Display settings ✓ Applied** |
| title: Offline — this screen hasn't applied the current hardware config yet / aria `{id}: offline, hardware config not yet applied` | **Offline. It will apply the new display settings when it's back.** / aria **{name}: offline, display settings waiting** |
| toast: Couldn't start the update on {id}. | **Couldn't start the update on {name}.** (name, not id) |

### Plugins (`categories/PluginsCategory.vue`, `specialized/PluginInstaller.vue`, `PluginManager.vue`, `OrderingManager.vue`, `PluginInstances.vue`, `composables/usePlugins.js`)

| Now | New |
|---|---|
| Only install plugins from sources you trust. A malicious pip package can execute arbitrary code on your server. | **Only install plugins from people you trust. A plugin runs on your Calvin server and can do anything Calvin can.** |
| Enter a GitHub repository URL and click "List plugins" to see available plugins and themes. | **Paste a GitHub address and choose List plugins.** |
| Using branch | **Version:** (the field shows the branch value; label only) |
| ℹ️ Branch switched from 'main' to 'master' (main branch not found) | → remove (an internal fallback, not news) |
| Install directly from a local cloned repository. Enter an absolute path to the repo root. | (dev mode only) **For plugin developers: install from a folder on the Calvin server.** |
| Themes install just like plugins — list a repository above, then install any theme that appears. Built-in themes (…) are always available. | **Themes are plugins too: install them here, then choose one in Dashboard › Appearance.** |
| Plugin installed — reload this page if it does not appear. | **Plugin installed.** (the list refreshes; if it really can't, the lane fixes the refresh rather than the copy) |
| `{n} instance(s)` / No instances configured | **{n} source(s)** / **No sources yet** |
| Running / Stopped (status title) | **Working** / **Off** |
| `usePlugins.js:53` type label "Backend" | **Background** (matches the content & plugins spec §3.4) |
| `usePlugins.js:657` Configuration saved successfully | **Saved.** |
| `PluginActions.vue:12` title `Custom action: {id}` | the action's `label`, else → remove the title |
| `ClockBarItemsTab.vue:110` Failed to update {name}: {err.message} | **Couldn't change {name}. Try again.** |

### Content and Security

| Where | Now | New |
|---|---|---|
| `SecuritySettings.vue:105` | {detail} or Failed to save sealed mode. | `friendlyError(err, "change sealed mode")` |
| `SecuritySettings.vue:145` | {detail} or Failed to save. | `friendlyError(err, "save the allowed sites")` |
| `useConfigForm.js:241` | {detail} or {err.message} or Failed to save configuration | `friendlyError(err, "save your settings")` |
| `settingsRegistry.js:307` | Power, display schedule, and timeout | **Screen on/off schedule and idle** |

"API keys" stays: it's what scripts and Home Assistant call it, and that section is for people setting those up.

## 3. Lock / setup, empty states

Checked (CLV-9, CLV-20, CLV-21, CLV-27 copy): no developer words. No changes.

## 4. Guard (vitest)

`tests/unit/copy/noDevWords.spec.js` scans template text and the `label|description|title|placeholder|aria-label|
message` strings in `components/**` and `composables/useSystem.js` for
`/\b(backend|frontend|api(?! key)|instance|schema|payload|endpoint|branch|repository|healthy|config(?!m))\b/i`.
- Allowlist: the Docker command block, dev-mode-only Local path copy, `dev/`.
- Plus: no `{{ *.error }}` / `err.message` interpolation in dashboard components (`components/*.vue` outside
  `settings/`).
