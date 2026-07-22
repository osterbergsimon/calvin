# Deployment-aware Maintenance Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Settings → Maintenance tab show only actions that work in the current deployment (Docker vs native), give "Restart backend" a working Docker path, and surface kiosk-agent updates in Maintenance.

**Architecture:** A new `GET /api/system/environment` endpoint reports deployment capabilities. `MaintenanceSettings.vue` fetches it on mount and conditionally renders the Updates flow (or host-update guidance), restart buttons, and a new Kiosk agents section that reuses `useKiosksStore`. `POST /system/restart-backend` gains a container path: graceful self-SIGTERM behind the compose `restart: unless-stopped` policy.

**Tech Stack:** FastAPI + pytest (backend), Vue 3 + Pinia + vitest/@vue/test-utils (frontend).

**Spec:** `docs/superpowers/specs/2026-07-22-maintenance-settings-usability-design.md`
**Bead:** calvin-ebl

## Global Constraints

- Backend logging via `loguru` (`from loguru import logger`), never stdlib `logging`.
- Frontend logging via `logDebug`/`logError` from `@/utils/logger` (components may keep existing `console.error` style where the file already uses it).
- The system router is mounted at prefix `/api/system` (`backend/app/main.py:561`) — route paths in `system.py` omit the prefix.
- Frontend `api` service (`@/services/api`) already has baseURL `/api`.
- Run backend tests from `backend/`: `uv run pytest tests/unit/<file> -v`. Run frontend tests from `frontend/`: `npx vitest run tests/unit/<file>`.
- Commit after every green task. Do not push.

---

### Task 1: Backend `GET /api/system/environment`

**Files:**
- Modify: `backend/app/api/routes/system.py` (add near `_restart_mechanism_available`, ~line 35)
- Test: `backend/tests/unit/test_system_environment.py` (new)

**Interfaces:**
- Produces: `_in_container() -> bool` (module-level, patchable; also used by Task 2) and route `GET /api/system/environment` returning `{deployment: "docker"|"native", is_dev_mode: bool, update_supported: bool, restart_backend_supported: bool, restart_frontend_supported: bool}`.
- Consumes: existing `_restart_mechanism_available()`, `settings.is_dev_mode`, `settings.get_update_script_path()`.

- [x] **Step 1: Write the failing tests**

Create `backend/tests/unit/test_system_environment.py`:

```python
"""Unit tests for GET /api/system/environment deployment capabilities."""

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.api.routes import system as system_routes


@pytest.mark.unit
def test_in_container_dockerenv(tmp_path):
    marker = tmp_path / ".dockerenv"
    marker.write_text("")
    with patch.object(system_routes, "_DOCKERENV_MARKER", marker):
        assert system_routes._in_container() is True


@pytest.mark.unit
def test_in_container_env_var(tmp_path, monkeypatch):
    missing = tmp_path / ".dockerenv"  # does not exist
    monkeypatch.setenv("CALVIN_CONTAINER", "1")
    with patch.object(system_routes, "_DOCKERENV_MARKER", missing):
        assert system_routes._in_container() is True


@pytest.mark.unit
def test_not_in_container(tmp_path, monkeypatch):
    missing = tmp_path / ".dockerenv"
    monkeypatch.delenv("CALVIN_CONTAINER", raising=False)
    with patch.object(system_routes, "_DOCKERENV_MARKER", missing):
        assert system_routes._in_container() is False


@pytest.mark.unit
def test_environment_docker_no_script_no_systemctl(test_client: TestClient, tmp_path):
    """Docker deployment: update unsupported, backend restart via container, no frontend restart."""
    missing_script = tmp_path / "update-calvin.sh"  # does not exist
    with (
        patch.object(system_routes, "_in_container", return_value=True),
        patch.object(system_routes, "_restart_mechanism_available", return_value=False),
        patch.object(
            system_routes.settings, "get_update_script_path", return_value=missing_script
        ),
    ):
        response = test_client.get("/api/system/environment")
    assert response.status_code == 200
    data = response.json()
    assert data["deployment"] == "docker"
    assert data["update_supported"] is False
    assert data["restart_backend_supported"] is True
    assert data["restart_frontend_supported"] is False
    assert isinstance(data["is_dev_mode"], bool)


@pytest.mark.unit
def test_environment_native_with_script_and_systemctl(test_client: TestClient, tmp_path):
    """Legacy native install: everything supported."""
    script = tmp_path / "update-calvin.sh"
    script.write_text("#!/bin/bash\n")
    with (
        patch.object(system_routes, "_in_container", return_value=False),
        patch.object(system_routes, "_restart_mechanism_available", return_value=True),
        patch.object(system_routes.settings, "get_update_script_path", return_value=script),
    ):
        response = test_client.get("/api/system/environment")
    assert response.status_code == 200
    data = response.json()
    assert data["deployment"] == "native"
    assert data["update_supported"] is True
    assert data["restart_backend_supported"] is True
    assert data["restart_frontend_supported"] is True


@pytest.mark.unit
def test_environment_native_bare(test_client: TestClient, tmp_path):
    """Native without script or systemctl (plain dev checkout): nothing supported."""
    missing_script = tmp_path / "update-calvin.sh"
    with (
        patch.object(system_routes, "_in_container", return_value=False),
        patch.object(system_routes, "_restart_mechanism_available", return_value=False),
        patch.object(
            system_routes.settings, "get_update_script_path", return_value=missing_script
        ),
    ):
        response = test_client.get("/api/system/environment")
    data = response.json()
    assert data["restart_backend_supported"] is False
    assert data["restart_frontend_supported"] is False
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_system_environment.py -v`
Expected: FAIL — `AttributeError: ... has no attribute '_DOCKERENV_MARKER'` / 404 on `/api/system/environment`.

- [x] **Step 3: Implement**

In `backend/app/api/routes/system.py`, directly below the `_restart_mechanism_available` function, add:

```python
# Marker file Docker creates in every container; module-level so tests can patch it.
_DOCKERENV_MARKER = Path("/.dockerenv")


def _in_container() -> bool:
    """True when running inside a container (Docker marker or explicit env opt-in)."""
    return _DOCKERENV_MARKER.exists() or os.environ.get("CALVIN_CONTAINER") == "1"


@router.get("/environment")
async def get_system_environment():
    """
    Report deployment capabilities so the UI only offers actions that can work.

    In Docker deployments the update script and systemctl live on the host, so
    updates/restarts via script are impossible from inside the container; backend
    restart is still possible via graceful exit + the container restart policy.
    """
    in_container = _in_container()
    restart_mechanism = _restart_mechanism_available()
    return {
        "deployment": "docker" if in_container else "native",
        "is_dev_mode": settings.is_dev_mode,
        "update_supported": settings.get_update_script_path().exists(),
        "restart_backend_supported": restart_mechanism or in_container,
        "restart_frontend_supported": restart_mechanism,
    }
```

(`os`, `Path`, `settings`, `router` are already imported in this file.)

- [x] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_system_environment.py -v`
Expected: 6 PASS.

- [x] **Step 5: Commit**

```bash
git add backend/app/api/routes/system.py backend/tests/unit/test_system_environment.py
git commit -m "feat(system): report deployment capabilities via /api/system/environment (calvin-ebl)"
```

---

### Task 2: Container-aware backend restart

**Files:**
- Modify: `backend/app/api/routes/system.py` — `restart_backend` endpoint (~line 708)
- Test: `backend/tests/unit/test_system_restart_helpers.py` (extend)

**Interfaces:**
- Consumes: `_in_container()` from Task 1.
- Produces: `POST /api/system/restart-backend` returns 200 in containers (self-SIGTERM after `_BACKEND_RESTART_DELAY_SEC`); native-without-mechanism still 500.

- [x] **Step 1: Write the failing tests**

Append to `backend/tests/unit/test_system_restart_helpers.py`:

```python
@pytest.mark.unit
def test_restart_backend_container_path(test_client):
    """In a container with no restart mechanism, respond 200 and schedule self-signal."""
    with (
        patch("app.api.routes.system._restart_mechanism_available", return_value=False),
        patch("app.api.routes.system._in_container", return_value=True),
        patch("app.api.routes.system.threading.Thread") as mock_thread,
    ):
        response = test_client.post("/api/system/restart-backend")
    assert response.status_code == 200
    assert "restart" in response.json()["message"].lower()
    mock_thread.assert_called_once()
    assert mock_thread.call_args.kwargs.get("daemon") is True
    mock_thread.return_value.start.assert_called_once()


@pytest.mark.unit
def test_restart_backend_native_without_mechanism_still_fails(test_client):
    with (
        patch("app.api.routes.system._restart_mechanism_available", return_value=False),
        patch("app.api.routes.system._in_container", return_value=False),
    ):
        response = test_client.post("/api/system/restart-backend")
    assert response.status_code == 500
```

Also add the missing import at the top of the test file if not present: `from fastapi.testclient import TestClient` is not needed (the `test_client` fixture provides it); `patch` is already imported.

- [x] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_system_restart_helpers.py -v`
Expected: the two new tests FAIL (container path returns 500 today).

- [x] **Step 3: Implement**

Add `import signal` to the imports of `backend/app/api/routes/system.py`. In `restart_backend`, replace the single availability guard:

```python
        if not _restart_mechanism_available():
            raise HTTPException(
                status_code=500,
                detail=(
                    "No restart method available (missing /usr/local/bin/restart-calvin-services.sh "
                    "and systemctl not found)."
                ),
            )
```

with:

```python
        if not _restart_mechanism_available():
            if _in_container():
                # Docker path: exit gracefully after the response is sent; the
                # container's restart policy (restart: unless-stopped in the
                # shipped compose file) starts a fresh container.
                def _run_container_restart() -> None:
                    time.sleep(_BACKEND_RESTART_DELAY_SEC)
                    logger.info("Container restart requested — sending SIGTERM to self")
                    os.kill(os.getpid(), signal.SIGTERM)

                threading.Thread(target=_run_container_restart, daemon=True).start()
                return {
                    "status": "success",
                    "message": (
                        "Backend container restarting — it will come back automatically "
                        "via the container restart policy."
                    ),
                }
            raise HTTPException(
                status_code=500,
                detail=(
                    "No restart method available (missing /usr/local/bin/restart-calvin-services.sh "
                    "and systemctl not found)."
                ),
            )
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_system_restart_helpers.py tests/unit/test_system_environment.py -v`
Expected: all PASS.

- [x] **Step 5: Commit**

```bash
git add backend/app/api/routes/system.py backend/tests/unit/test_system_restart_helpers.py
git commit -m "feat(system): restart backend inside Docker via graceful self-term (calvin-ebl)"
```

---

### Task 3: Deployment-aware MaintenanceSettings

**Files:**
- Modify: `frontend/src/services/systemApi.js` (add `getSystemEnvironment`)
- Modify: `frontend/src/components/settings/categories/MaintenanceSettings.vue`
- Test: `frontend/tests/unit/components/MaintenanceSettings.spec.js` (new)

**Interfaces:**
- Consumes: `GET /api/system/environment` (Task 1).
- Produces: `getSystemEnvironment(): Promise<{deployment, is_dev_mode, update_supported, restart_backend_supported, restart_frontend_supported}>`; `MaintenanceSettings` renders `[data-test="update-guidance"]` when updates are unsupported and hides restart rows per capability. Task 4 adds the kiosk-agents section between Updates and System.

- [x] **Step 1: Write the failing tests**

Create `frontend/tests/unit/components/MaintenanceSettings.spec.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import MaintenanceSettings from "@/components/settings/categories/MaintenanceSettings.vue";

const systemMock = vi.hoisted(() => ({
  restartBackend: vi.fn(() => Promise.resolve()),
  restartFrontend: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/composables", () => ({
  useSystem: () => systemMock,
}));

const apiMock = vi.hoisted(() => ({
  getSystemEnvironment: vi.fn(),
}));

vi.mock("@/services/systemApi", () => apiMock);

// UpdatesTab pulls in the full update flow; stub it — this spec only cares
// about whether MaintenanceSettings renders it.
const stubs = {
  UpdatesTab: { template: '<div data-test="updates-tab" />' },
};

const mountTab = (env, extraStubs = {}) => {
  apiMock.getSystemEnvironment.mockResolvedValue(env);
  return mount(MaintenanceSettings, {
    props: { config: {}, gitRepoUrl: "", gitBranch: "main" },
    global: { stubs: { ...stubs, ...extraStubs } },
  });
};

const DOCKER_ENV = {
  deployment: "docker",
  is_dev_mode: false,
  update_supported: false,
  restart_backend_supported: true,
  restart_frontend_supported: false,
};

const NATIVE_ENV = {
  deployment: "native",
  is_dev_mode: false,
  update_supported: true,
  restart_backend_supported: true,
  restart_frontend_supported: true,
};

describe("MaintenanceSettings — deployment awareness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the UpdatesTab when updates are supported", async () => {
    const wrapper = mountTab(NATIVE_ENV);
    await flushPromises();
    expect(wrapper.find('[data-test="updates-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="update-guidance"]').exists()).toBe(false);
  });

  it("renders host-update guidance instead of the UpdatesTab in Docker", async () => {
    const wrapper = mountTab(DOCKER_ENV);
    await flushPromises();
    expect(wrapper.find('[data-test="updates-tab"]').exists()).toBe(false);
    const guidance = wrapper.find('[data-test="update-guidance"]');
    expect(guidance.exists()).toBe(true);
    expect(guidance.text()).toContain("update-calvin.sh");
  });

  it("hides the frontend restart row when unsupported, keeps backend restart", async () => {
    const wrapper = mountTab(DOCKER_ENV);
    await flushPromises();
    expect(wrapper.find('[data-test="restart-backend"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="restart-frontend"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="reload-ui"]').exists()).toBe(true);
  });

  it("shows all restart rows on a full native install", async () => {
    const wrapper = mountTab(NATIVE_ENV);
    await flushPromises();
    expect(wrapper.find('[data-test="restart-backend"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="restart-frontend"]').exists()).toBe(true);
  });

  it("falls back to showing everything when the environment fetch fails", async () => {
    apiMock.getSystemEnvironment.mockRejectedValue(new Error("network"));
    const wrapper = mount(MaintenanceSettings, {
      props: { config: {}, gitRepoUrl: "", gitBranch: "main" },
      global: { stubs },
    });
    await flushPromises();
    expect(wrapper.find('[data-test="updates-tab"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="restart-backend"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="restart-frontend"]').exists()).toBe(true);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/unit/components/MaintenanceSettings.spec.js`
Expected: FAIL — `getSystemEnvironment` is not exported; `data-test` hooks don't exist.

- [x] **Step 3: Implement**

**`frontend/src/services/systemApi.js`** — append:

```javascript
/**
 * Get deployment capabilities (docker vs native, which actions work here).
 */
export async function getSystemEnvironment() {
  const response = await api.get("/system/environment");
  return response.data;
}
```

**`frontend/src/components/settings/categories/MaintenanceSettings.vue`** — template changes:

```html
    <SettingsSection id="maintenance-updates" title="Updates">
      <UpdatesTab
        v-if="cap.update_supported"
        :git-repo-url="gitRepoUrl"
        :git-branch="gitBranch"
        @update:git-repo-url="v => emit('update:gitRepoUrl', v)"
        @update:git-branch="v => emit('update:gitBranch', v)"
      />
      <SettingRow
        v-else
        label="Server updates"
        description="This server runs as a Docker container, so updates are applied on the host by pulling the published image."
        stacked
      >
        <div class="maint-guidance" data-test="update-guidance">
          <code class="maint-guidance__cmd">sudo /usr/local/bin/update-calvin.sh</code>
          <p class="maint-guidance__note">
            …or manually: <code>docker compose pull && docker compose up -d</code> in
            <code>/etc/calvin</code>. Kiosk agents are updated below — they don't need
            a server update.
          </p>
        </div>
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="maintenance-system" title="System">
      <SettingRow
        v-if="cap.restart_backend_supported"
        label="Restart backend"
        description="Restart the backend API server."
      >
        <button type="button" class="maint-btn" data-test="restart-backend" @click="askRestartBackend">
          Restart backend
        </button>
      </SettingRow>
      <SettingRow
        v-if="cap.restart_frontend_supported"
        label="Restart frontend"
        description="Restart the frontend service."
      >
        <button type="button" class="maint-btn" data-test="restart-frontend" @click="askRestartFrontend">
          Restart frontend
        </button>
      </SettingRow>
      <SettingRow label="Reload UI" description="Reload the browser page.">
        <button type="button" class="maint-btn" data-test="reload-ui" @click="reloadUi">Reload UI</button>
      </SettingRow>
    </SettingsSection>
```

(Diagnostics section and ConfirmModal stay unchanged.)

Script additions:

```javascript
import { computed, onMounted, reactive, ref } from "vue";
import { getSystemEnvironment } from "@/services/systemApi";

// Deployment capabilities. null until fetched; on fetch failure we deliberately
// fall back to "show everything" so a transient error can't hide working controls.
const environment = ref(null);
const cap = computed(
  () =>
    environment.value ?? {
      deployment: "unknown",
      update_supported: true,
      restart_backend_supported: true,
      restart_frontend_supported: true,
    }
);

onMounted(async () => {
  try {
    environment.value = await getSystemEnvironment();
  } catch (e) {
    console.error("Failed to load system environment:", e);
  }
});
```

Adjust the confirm-dialog copy for containers — in `askRestartBackend`:

```javascript
const askRestartBackend = () => {
  confirm.title = "Restart backend?";
  confirm.message =
    cap.value.deployment === "docker"
      ? "The backend container will restart via its restart policy. The display briefly disconnects."
      : "The display will briefly disconnect while the backend restarts.";
  confirm.action = "backend";
  confirm.show = true;
};
```

Style additions (scoped block):

```css
.maint-guidance {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.maint-guidance__cmd {
  display: block;
  padding: 0.6rem 0.75rem;
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-family: var(--font-data);
  font-size: var(--fs-sm);
  color: var(--ink);
  user-select: all;
}
.maint-guidance__note {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  color: var(--ink-3);
  line-height: 1.5;
}
.maint-guidance__note code {
  font-family: var(--font-data);
  font-size: 0.9em;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/unit/components/MaintenanceSettings.spec.js tests/unit/components/UpdatesTab.spec.js`
Expected: all PASS (UpdatesTab spec guards against regressions in the extracted flow).

- [x] **Step 5: Commit**

```bash
git add frontend/src/services/systemApi.js frontend/src/components/settings/categories/MaintenanceSettings.vue frontend/tests/unit/components/MaintenanceSettings.spec.js
git commit -m "feat(settings): deployment-aware Maintenance tab (calvin-ebl)"
```

---

### Task 4: Kiosk agents section

**Files:**
- Create: `frontend/src/components/settings/shared/KioskAgentsSection.vue`
- Modify: `frontend/src/components/settings/categories/MaintenanceSettings.vue` (mount the section between Updates and System)
- Test: `frontend/tests/unit/components/KioskAgentsSection.spec.js` (new)

**Interfaces:**
- Consumes: `useKiosksStore` — `kiosks` ref, `loadKiosks()`, `fetchAvailableAgentVersion()`, `triggerUpdate(id)` (all existing, see `frontend/src/stores/kiosks.js`).
- Produces: `<KioskAgentsSection />` (no props) — renders nothing when no kiosks are registered.

- [x] **Step 1: Write the failing tests**

Create `frontend/tests/unit/components/KioskAgentsSection.spec.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import KioskAgentsSection from "@/components/settings/shared/KioskAgentsSection.vue";
import { useKiosksStore } from "@/stores/kiosks";

function setupStore({ kiosks = [], availableVersion = null } = {}) {
  setActivePinia(createPinia());
  const store = useKiosksStore();
  store.loadKiosks = vi.fn(async () => {
    store.kiosks = kiosks;
  });
  store.fetchAvailableAgentVersion = vi.fn(async () => availableVersion);
  store.triggerUpdate = vi.fn(async () => {});
  return store;
}

const kiosk = (over = {}) => ({
  id: "kitchen",
  hostname: "pi",
  lastSeen: new Date().toISOString(),
  agentVersion: "0.1.0",
  agentUpdateStatus: "ok",
  agentUpdateRequested: false,
  ...over,
});

describe("KioskAgentsSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when no kiosks are registered", async () => {
    setupStore();
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    expect(wrapper.find('[data-test="agent-row"]').exists()).toBe(false);
    expect(wrapper.text()).toBe("");
  });

  it("lists kiosks with agent and available versions", async () => {
    setupStore({ kiosks: [kiosk()], availableVersion: "0.2.0" });
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    const row = wrapper.find('[data-test="agent-row"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain("kitchen");
    expect(row.text()).toContain("0.1.0");
    expect(row.text()).toContain("0.2.0");
  });

  it("triggers the agent update from the row button", async () => {
    const store = setupStore({ kiosks: [kiosk()], availableVersion: "0.2.0" });
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    await wrapper.find('[data-test="agent-update-btn"]').trigger("click");
    await flushPromises();
    expect(store.triggerUpdate).toHaveBeenCalledWith("kitchen");
  });

  it("hides the update button when the agent is current", async () => {
    setupStore({ kiosks: [kiosk({ agentVersion: "0.2.0" })], availableVersion: "0.2.0" });
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    expect(wrapper.find('[data-test="agent-update-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="agent-row"]').text()).toContain("up to date");
  });

  it("shows Updating… disabled while an update is requested", async () => {
    setupStore({
      kiosks: [kiosk({ agentUpdateRequested: true })],
      availableVersion: "0.2.0",
    });
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    const btn = wrapper.find('[data-test="agent-update-btn"]');
    expect(btn.text()).toBe("Updating…");
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("surfaces an agent update error state", async () => {
    setupStore({
      kiosks: [kiosk({ agentUpdateStatus: "error: device python < 3.9" })],
      availableVersion: "0.2.0",
    });
    const wrapper = mount(KioskAgentsSection);
    await flushPromises();
    expect(wrapper.find('[data-test="agent-row"]').text()).toContain("needs OS update");
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/unit/components/KioskAgentsSection.spec.js`
Expected: FAIL — component file does not exist.

- [x] **Step 3: Implement the component**

Create `frontend/src/components/settings/shared/KioskAgentsSection.vue`:

```html
<template>
  <SettingsSection v-if="kiosks.length > 0" id="maintenance-kiosk-agents" title="Kiosk agents">
    <p class="agents__hint">
      Remote kiosk Pis run a small display agent. Updates are fetched from this server —
      the kiosk needs no internet access.
    </p>
    <div v-for="k in kiosks" :key="k.id" class="agent-row" data-test="agent-row">
      <span class="agent-row__dot" :class="isOnline(k) ? 'is-online' : 'is-offline'" aria-hidden="true" />
      <span class="agent-row__id">{{ k.id }}</span>
      <span class="agent-row__version">
        <template v-if="k.agentVersion">agent {{ k.agentVersion }}</template>
        <template v-else>agent version unknown</template>
        <template v-if="updateAvailable(k)"> → {{ availableVersion }}</template>
        <template v-else-if="isCurrent(k)"> · up to date</template>
      </span>
      <span class="agent-row__end">
        <span v-if="hasAgentError(k)" class="agent-row__error">needs OS update</span>
        <button
          v-if="updateAvailable(k) || k.agentUpdateRequested"
          type="button"
          class="agent-row__update"
          data-test="agent-update-btn"
          :disabled="k.agentUpdateRequested"
          @click="onUpdate(k.id)"
        >
          {{ k.agentUpdateRequested ? "Updating…" : "Update" }}
        </button>
      </span>
    </div>
  </SettingsSection>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useKiosksStore } from "@/stores/kiosks";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";

const store = useKiosksStore();
const kiosks = computed(() => store.kiosks);
const availableVersion = ref(null);

const ONLINE_WINDOW_MS = 120000; // 2 minutes, matches KiosksSettings

function isOnline(k) {
  if (!k.lastSeen) return false;
  return Date.now() - Date.parse(k.lastSeen) < ONLINE_WINDOW_MS;
}

function updateAvailable(k) {
  return (
    availableVersion.value != null &&
    k.agentVersion != null &&
    k.agentVersion !== availableVersion.value
  );
}

function isCurrent(k) {
  return availableVersion.value != null && k.agentVersion === availableVersion.value;
}

function hasAgentError(k) {
  return typeof k.agentUpdateStatus === "string" && k.agentUpdateStatus.startsWith("error");
}

async function onUpdate(id) {
  await store.triggerUpdate(id);
}

onMounted(async () => {
  await store.loadKiosks();
  availableVersion.value = await store.fetchAvailableAgentVersion();
});
</script>

<style scoped>
.agents__hint {
  margin: 0 0 0.5rem;
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  color: var(--ink-3);
  line-height: 1.5;
}
.agent-row {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 0.65rem;
  padding: 0.5rem 0;
}
.agent-row + .agent-row {
  border-top: 1px solid var(--line-soft);
}
.agent-row__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--ink-3);
}
.agent-row__dot.is-online {
  background: var(--ok);
}
.agent-row__id {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink);
}
.agent-row__version {
  font-family: var(--font-data);
  font-size: var(--fs-xs);
  color: var(--ink-2);
}
.agent-row__end {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.agent-row__error {
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  color: var(--warn);
}
.agent-row__update {
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: var(--fs-control);
  font-weight: 500;
  color: var(--focus);
  background: transparent;
  border: 1px solid var(--focus);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.agent-row__update:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.agent-row__update:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
```

In `MaintenanceSettings.vue`, between the Updates and System sections, add:

```html
    <KioskAgentsSection />
```

with the import `import KioskAgentsSection from "@/components/settings/shared/KioskAgentsSection.vue";` — and stub it in `MaintenanceSettings.spec.js` (`KioskAgentsSection: { template: "<div />" }` added to the shared `stubs` object) so that spec stays isolated from Pinia.

- [x] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/unit/components/KioskAgentsSection.spec.js tests/unit/components/MaintenanceSettings.spec.js tests/unit/components/KiosksSettings.spec.js tests/unit/components/KiosksSettings.updateButton.spec.js`
Expected: all PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/settings/shared/KioskAgentsSection.vue frontend/src/components/settings/categories/MaintenanceSettings.vue frontend/tests/unit/components/KioskAgentsSection.spec.js frontend/tests/unit/components/MaintenanceSettings.spec.js
git commit -m "feat(settings): kiosk agent update overview in Maintenance (calvin-ebl)"
```

---

### Task 5: Registry, section map, docs, full suite

**Files:**
- Modify: `frontend/src/components/settings/settingsRegistry.js`
- Modify: `frontend/src/views/Settings.vue` (SECTION_BY_CATEGORY_TAB, ~line 289)
- Modify: `docs/setup/DEPLOYMENT_TOPOLOGIES.md` ("Kiosk agent self-update" section)
- Test: `frontend/tests/unit/components/settingsRegistry.spec.js` (extend)

**Interfaces:**
- Consumes: section ids `maintenance-kiosk-agents` (Task 4) and `maintenance-system` (Task 3, already the SettingsSection id).
- Produces: search destinations `maintenance-kiosk-agents`, `maintenance-system`.

- [x] **Step 1: Write the failing test**

Append to the `describe` block in `frontend/tests/unit/components/settingsRegistry.spec.js`:

```javascript
  it("resolves the maintenance destinations", () => {
    expect(getSettingDestinationById("maintenance-kiosk-agents")).toMatchObject({
      category: "maintenance",
      tab: "kiosk-agents",
    });
    expect(getSettingDestinationById("maintenance-system")).toMatchObject({
      category: "maintenance",
      tab: "system",
    });
    expect(filterSettingsDestinations("agent").map(item => item.id)).toContain(
      "maintenance-kiosk-agents"
    );
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/unit/components/settingsRegistry.spec.js`
Expected: new test FAILS (destinations undefined).

- [x] **Step 3: Implement**

**`settingsRegistry.js`:**

- Maintenance category entry becomes:

```javascript
  { id: "maintenance", label: "Maintenance", icon: "⚙️", subtitle: "Updates · agents · diagnostics" },
```

- `maintenance-updates` keywords become:

```javascript
    keywords: ["updates", "git", "repository", "branch", "docker", "image", "pull", "version"],
```

- After the `maintenance-updates` destination, insert:

```javascript
  {
    id: "maintenance-kiosk-agents",
    label: "Kiosk agent updates",
    path: "Maintenance / Kiosk agents",
    category: "maintenance",
    tabKey: "settings_tab_maintenance",
    tab: "kiosk-agents",
    keywords: ["kiosk", "agent", "update", "bundle", "fleet", "display agent"],
  },
  {
    id: "maintenance-system",
    label: "Restart and reload",
    path: "Maintenance / System",
    category: "maintenance",
    tabKey: "settings_tab_maintenance",
    tab: "system",
    keywords: ["restart", "reload", "backend", "frontend", "container"],
  },
```

**`Settings.vue`** — extend the maintenance map:

```javascript
  maintenance: {
    updates: "maintenance-updates",
    "kiosk-agents": "maintenance-kiosk-agents",
    system: "maintenance-system",
    diagnostics: "maintenance-diagnostics",
  },
```

**`docs/setup/DEPLOYMENT_TOPOLOGIES.md`** — in "Kiosk agent self-update", change the flow sentence to mention both entry points:

```
**Flow:** Settings → Kiosks → click **Update** (or Settings → Maintenance →
**Kiosk agents**) → the backend sets a per-kiosk `agentUpdateRequested` flag → …
```

- [x] **Step 4: Run the full test suites**

Run: `cd frontend && npx vitest run` and `cd backend && uv run pytest tests/unit -q`
Expected: all PASS (fix anything that regressed before proceeding).

- [x] **Step 5: Lint/format checks**

Run: `cd frontend && npx eslint src/components/settings/categories/MaintenanceSettings.vue src/components/settings/shared/KioskAgentsSection.vue src/components/settings/settingsRegistry.js src/services/systemApi.js && npx prettier --check src/components/settings/ src/services/systemApi.js`
Run: `cd backend && uv run ruff check app/api/routes/system.py && uv run ruff format --check app/api/routes/system.py`
Expected: clean (apply fixes if not).

- [x] **Step 6: Commit and close the bead**

```bash
git add frontend/src/components/settings/settingsRegistry.js frontend/src/views/Settings.vue frontend/tests/unit/components/settingsRegistry.spec.js docs/setup/DEPLOYMENT_TOPOLOGIES.md
git commit -m "feat(settings): maintenance search destinations + docs for agent updates (calvin-ebl)"
bd close calvin-ebl
```
