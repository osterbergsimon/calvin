# Deployment-aware System + kiosk software (CLV-19)

Status: spec, rescuing the still-useful parts of PR #110 ("Deployment-aware Maintenance settings tab",
calvin-ebl, July 2026) onto today's Settings. Mockup: [mocks/clv-19/clv-19.html](mocks/clv-19/clv-19.html), PNGs in
[mocks/clv-19/png/](mocks/clv-19/png/) (`s1.png` … `s4.png`). Built only from existing tokens and components.
**Owner decision (§4): container self-restart is not built.**

## 1. Gap analysis: PR #110's five ideas against develop

| # | #110 idea | Verdict | Where it is on develop | What's left |
|---|---|---|---|---|
| 1 | `GET /api/system/environment` with deployment and capability flags | **Done** (#129, calvin-hhok) | `backend/app/api/routes/system.py:270` returns `deployment`, `host_control`, `capabilities {update, restart, reboot}`, `update_instructions`. `frontend/src/composables/useSystem.js:19-57` loads it once per page. | Nothing structural. #110 split restart into backend and frontend flags; develop has one `restart`. That's enough once the frontend row is renamed (§3.3). |
| 2 | Deployment-aware tab: git update UI only where it works, host-update hint in Docker, restart rows per capability | **Mostly done** (#129 + CLV-2 + CLV-17) | `UpdatesTab.vue:3` shows "How to update" in containers. `MaintenanceSettings.vue:21-35` hides the restart rows when `deployment === "docker"` or `host_control === false`. | **Partly missing:** (a) the rows are gated on host control, not on `capabilities.restart`, so a native Pi with host control but no `systemctl`/helper shows buttons that answer 500; (b) "Restart frontend" actually restarts `calvin-kiosk.service` (the kiosk browser, see `scripts/restart-calvin-services.sh:39`), and its label says otherwise. |
| 3 | "Restart backend" in Docker: SIGTERM itself after a 200, compose brings it back | **Missing, needs an owner decision** | `system.py:46` `_reject_in_container` refuses it with 409. | See §4. |
| 4 | "Kiosk agents" fleet section: version vs available bundle, online dot, Update / Updating… / needs OS update, hidden with no kiosks | **Partly done** | `KiosksSettings.vue:48-63` has the per-kiosk **Update** / **Updating…** / "needs OS update" controls, and `stores/kiosks.js:48-56` has `triggerUpdate` and `fetchAvailableAgentVersion`. | **Missing:** no versions are shown anywhere, there is no fleet summary or "update all", and nothing in System says kiosks are behind. **Wrong:** every `error…` status is labelled "needs OS update", but the updater also reports rollbacks (`deploy/kiosk-agent/update-kiosk.sh:550`, "rolled back to previous version"). |
| 5 | Registry destinations and docs | **Partly obsolete, partly missing** | CLV-17 already added `maintenance-system` (System › Restart) and the "docker/image/pull" style keywords. | **Missing:** a `kiosks-software` destination. `docs/setup/DEPLOYMENT_TOPOLOGIES.md:174-190` should mention the summary row. The "Updates · agents · diagnostics" subtitle is **obsolete** (it conflicts with CLV-17's subtitle and the new placement). |

## 2. Where the kiosk fleet view lives: **Kiosks**, with one pointer from System

**Decision: in Kiosks, not System.** System is about *this server* (its version, its restart, its backups).
Kiosks is already the per-device home: the cards there have the online dot, last seen and the Update button.
A second fleet list in System would duplicate state and controls. Instead:

- **Kiosks** gets a "Kiosk software" summary at the top of its list, versions on every card, and fixed states (§3.1–3.2).
- **System › Updates** gets one pointer row, shown only while at least one kiosk can be updated (§3.4).

## 3. Spec

### 3.1 Kiosks › "Kiosk software" summary row

Placed in `KiosksSettings.vue` inside `SettingsSection id="kiosks-list"`, **above** the kiosk cards and below
the intro or "+ Add kiosk" button. It is a `SettingRow` (existing shell component).

**Shown only when at least one registered kiosk reports an agent version** (`k.agentVersion != null`).
Browser-only kiosks (`?kiosk=name`) have no agent. With none, the row is omitted, so an all-in-one or
browser-only setup sees no noise.

Inputs: `availableVersion` from `fetchAvailableAgentVersion()`, and the kiosks with an agent. Let
`behind` = agent kiosks with `agentVersion !== availableVersion` **that aren't blocked**, where blocked means
the last update failed because the kiosk's OS is too old (§3.2, "needs a newer OS"). Retrying those can't
succeed, so they are never counted or included in **Update all**. Let `updating` = kiosks with
`agentUpdateRequested`. When every out-of-date kiosk is blocked, the row shows the "all up to date" state's
sibling: **No kiosk can be updated right now. {n} need(s) a newer OS first.**

| State | Label | Description | Control |
|---|---|---|---|
| Manifest not loaded yet | **Kiosk software** | **Checking for updates…** | none |
| Manifest failed (`availableVersion == null` after load) | **Kiosk software** | **Couldn't check for kiosk updates. The kiosks keep working.** | **Try again** (`.btn`) |
| All up to date | **Kiosk software** | **All kiosks are up to date ({v}).** | none |
| Some behind, none updating | **Kiosk software** | **{n} of {total} kiosks can be updated to {v}.** (1 → **1 kiosk can be updated to {v}.**) | **Update all** (`.btn--primary`) |
| Updating | **Kiosk software** | **Updating {n} kiosk(s)… They restart their screen when done.** | **Update all**, disabled, label **Updating…** |

- `{v}` = the available version, shown as the first 7 characters in `--font-data` (versions are commit
  hashes). `{total}` counts only agent kiosks.
- **Update all** calls `store.triggerUpdate(id)` for each kiosk in `behind` that is **online**. Offline ones get
  the request too: the flag waits for their next poll, as today. The row then refreshes the list.
  No confirmation, because updates are safe (rollback is automatic).
- If any `triggerUpdate` rejects: a `notify` error toast **Couldn't start the update on {id}.** The others
  continue.

### 3.2 Kiosk card: version line and update states

Each `kiosk-card` keeps its layout (id, online dot, hostname · seen). A third meta line is added under
`kiosk-card__meta`, in the same style (`--fs-sm`, `--ink-2`), only for kiosks with an agent:

| State | Version line | Button row (existing `kiosk-card__update-row`) |
|---|---|---|
| Up to date | **Kiosk software {cur} · up to date** | none |
| Update available | **Kiosk software {cur} · {v} available** | **Update** |
| Requested | **Updating to {v}…** | **Updating…** (disabled) |
| Failed: Python too old (`agentUpdateStatus` starts with `error` and the message contains `python`) | **Kiosk software {cur} · update needs a newer OS** in `--warn` | **Update** hidden. A `--fs-sm` line: **Reinstall this kiosk with a current Raspberry Pi OS, then update.** |
| Failed: other (`error`, for example rollback) | **Kiosk software {cur} · last update failed, kept this version** in `--err` | **Try again** (same `onUpdate`) |
| No agent (`agentVersion == null`) | no line | none |

- `{cur}` = the kiosk's `agentVersion`, first 7 characters, `--font-data`.
- The existing "needs OS update" span is **removed**. The rows above replace it.
- **Backend need (small):** the kiosk list must expose the agent's failure message, not just
  `error…`. Add `agentUpdateMessage` (the updater's `message` field, already written by
  `update-kiosk.sh:268`) to `GET /api/kiosks`. Until it lands, treat every error as "other".
- Touch: **Update**, **Try again** and **Update all** have `min-height: var(--touch-target)`.
- Phone width (< 480px): the summary `SettingRow` stacks (control full width), and the cards already stack.

### 3.3 System › Restart (`MaintenanceSettings.vue`)

- Gate the restart rows on **`environment.capabilities.restart === true`**, not on deployment/host control.
  Keep today's fallback: when the environment request failed (`environment == null`), show the rows.
- Rename **Restart frontend** → **Restart kiosk browser**, with description
  **Restarts the browser on this Pi's screen. The server keeps running.** (It restarts `calvin-kiosk.service`.)
  Confirm dialog: title **Restart the kiosk browser?**, message **The screen goes blank for a few seconds.**,
  button **Restart browser**.
- **Restart backend** → label **Restart Calvin server**, description **Restarts Calvin. Screens reconnect
  on their own in about 15 seconds.** Confirm: title **Restart the Calvin server?**, message
  **Settings and screens lose connection for about 15 seconds.**, button **Restart server**.
- **Reload UI** stays visible always (it is client-side, `MaintenanceSettings.vue:157`).
- When the restart rows are hidden in a container, add one `--fs-sm` `--ink-2` line under Reload UI:
  **To restart the server, restart the Calvin container from Docker (Unraid: Docker tab).** Show it only when
  `deployment === "docker"`.

### 3.4 System › Updates: pointer to kiosk updates

Under the existing Updates content, a `SettingRow`, **only while `behind.length > 0`** (`behind` as defined in §3.1):
- Label **Kiosk software**. Description **{n} kiosk(s) can be updated to {v}.**
- Control: **Open Kiosks** (`.btn`). It routes to `/settings?setting=kiosks-software`.

It reads the same kiosks store, so it is never out of sync with §3.1. It doesn't update anything itself.

### 3.5 Registry and docs

- New destination `kiosks-software`: label **Update kiosk software**, path **Kiosks / Kiosk software**,
  `category: "kiosks"`, section `kiosks-list`. Keywords: kiosk, agent, update, software, version, bundle, fleet.
- Add keywords `kiosk update`, `agent` to `maintenance-updates`.
- No subtitle changes (CLV-17's stay).
- `docs/setup/DEPLOYMENT_TOPOLOGIES.md` "Kiosk agent self-update": the flow starts at
  "Settings → Kiosks → Kiosk software → **Update all** (or **Update** on one kiosk)". Mention the System pointer.

## 4. Container self-restart

**Decision (owner, 2026-10-29): A, not built.** Containers are restarted from Docker. In a container, System › Restart shows only Reload UI and the one-line Docker pointer (§3.3). Options B and C below are recorded for context and are **out of build scope**.

**Background.** `CALVIN_HOST_CONTROL` guards actions on the *machine* (reboot, systemd, the update script,
display power). A container's self-exit touches **only its own process**, so it isn't host control. But it
only works if Docker restarts the container, and Calvin can't check that from inside (no Docker socket,
by design).

- `docker/docker-compose.yml:23` sets `restart: unless-stopped`, so compose installs come back.
- The **Unraid template** (`deploy/unraid/calvin.xml`) sets no restart policy (`<ExtraParams/>` is empty), and its
  Overview tells users to restart from the Docker tab. A self-exit there could leave Calvin **stopped** until
  someone opens Unraid. (Unverified on a real Unraid box: confirm the policy dockerMan applies.)

**Options**

- **A. Don't build it (chosen).** Containers keep restarting from Docker; §3.3 adds the one-line pointer.
  Restarts are rarely needed now: plugin installs are live and config is hot.
- **B. (Not built.) Build it behind its own opt-in.** A separate setting `CALVIN_SELF_RESTART=1`, **not** a host-control
  exception. It defaults on only in `docker/docker-compose.yml` (next to `restart: unless-stopped`). The Unraid
  template gets it plus `--restart=unless-stopped` in ExtraParams. `GET /api/system/environment` adds
  `capabilities.restart_self`. `POST /api/system/restart-backend` in a container then returns 200 and, after
  the existing `_BACKEND_RESTART_DELAY_SEC`, sends SIGTERM to its own PID. Code placement: a new
  `require_self_restart()` beside `require_host_control()` in `backend/app/utils/host_control.py`, so the two
  guards read side by side and can't be confused. UI: the **Restart Calvin server** row (§3.3) shows when
  `restart_self` is true. Confirm message: **Calvin restarts its container. Docker starts it again in a few
  seconds. If it doesn't come back, start it from Docker.**
- **C. (Not built.) Build it with no opt-in.** Not recommended: it silently strands Unraid installs that lack a restart policy.

## 5. Tests

**Frontend (vitest)**
- Kiosks summary: hidden with no agent kiosks; each §3.1 state's copy; **Update all** calls `triggerUpdate`
  once per behind kiosk; one rejection shows the toast and the rest still run; singular and plural copy.
- Kiosk card: each §3.2 state, including the python-vs-other error split from `agentUpdateMessage` and the
  fallback to "other" when the field is missing. The "needs OS update" span is gone.
- System: restart rows follow `capabilities.restart` (true → shown, false → hidden, env null → shown);
  the new labels and confirm copy; the container pointer line appears only for docker.
- System › Updates pointer appears only while a kiosk is behind and routes to `kiosks-software`.
- Registry: `kiosks-software` resolves to the Kiosks category, and the destination id snapshot gains exactly one id.

**Backend (pytest)**
- `GET /api/kiosks` includes `agentUpdateMessage` from the stored status.
