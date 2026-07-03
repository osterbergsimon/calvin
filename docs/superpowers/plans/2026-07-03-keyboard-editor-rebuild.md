# Keyboard Mappings Editor Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the keyboard-mappings editor as a shell-native "device board" with press-to-capture binding and a grouped, generic-first action picker, on a unified single-keyboard data model (no more `keyboard_type`).

**Architecture:** Collapse the two stored keyboard maps into one flat `{KEY_*: action}` table across DB, service, API, config, and runtime (Alembic migration keeps the active type's rows). The frontend gains a shared `event.code → KEY_*` normalizer used by both runtime resolution and capture, a UI-only action catalog for picker grouping, and a small set of focused Vue components. `useKeyboardActions.js` (the action vocabulary) is frozen and untouched.

**Tech Stack:** FastAPI + Ormar + Alembic (SQLite), pytest; Vue 3 Composition API, Pinia, Vitest + @vue/test-utils.

## Global Constraints

- **`frontend/src/composables/useKeyboardActions.js` MUST NOT change.** The action vocabulary is frozen — no actions added, removed, renamed, or re-behaved.
- Runtime keyboard behavior (which action a key triggers) must be **unchanged** for existing bindings.
- The default mapping is preserved verbatim: `KEY_1→generic_prev, KEY_2→generic_expand_close, KEY_3→generic_next, KEY_4→region_next, KEY_5→screen_prev, KEY_6→screen_next, KEY_7→mode_settings`.
- Retiring `mode_cycle`/`mode_spare` and renaming screen-jumps is **out of scope** (tracked in calvin-py5).
- Backend: Python 3.12+, `loguru` (not stdlib logging), `retry_on_db_locked` for DB writes where the surrounding code already uses it. Frontend: `logDebug`/`logError` from `@/utils/logger`.
- Escape (`KEY_ESCAPE`) is reserved to cancel capture and cannot be bound.

---

## File Structure

**Backend**
- `app/models/db_models.py` — drop `keyboard_type` column from `KeyboardMappingDB`.
- `app/services/keyboard_mapping_service.py` — flat API: `get_mappings()`, `set_mappings(map)`, `set_mapping(key, action)`, `remove_mapping(key)`.
- `app/api/routes/keyboard.py` — flat `GET`/`POST`, per-key `PUT`/`DELETE`.
- `app/main.py` — single-map seed; remove `keyboard_type` default.
- `app/api/routes/config.py` — remove `keyboardType` field + snake_case mapping.
- `alembic/versions/<hash>_unify_keyboard_mappings.py` — new migration.

**Frontend**
- `src/utils/keyCode.js` — new; shared `normalizeKeyCode(event)`.
- `src/utils/keyboardActionsCatalog.js` — new; picker metadata (labels/groups/tiers).
- `src/stores/keyboard.js` — flat map + capture primitives + per-key actions.
- `src/components/KeyboardHandler.vue` — use normalizer + flat resolve + capture intercept.
- `src/composables/useKeyCapture.js` — new; arm/await/cancel capture.
- `src/components/settings/tabs/layout/keyboard/ActionPicker.vue` — new.
- `src/components/settings/tabs/layout/keyboard/KeyBindingTile.vue` — new.
- `src/components/settings/tabs/layout/keyboard/KeyBindingBoard.vue` — new.
- `src/components/settings/tabs/layout/KeyboardTab.vue` — rebuilt container.
- `src/components/settings/categories/DeviceSettings.vue` — mount unchanged (verify no `keyboardType` read).

---

## Phase A — Backend: unify to a flat model

### Task 1: Flatten `KeyboardMappingService` and drop the model column

**Files:**
- Modify: `backend/app/models/db_models.py:36` (remove `keyboard_type`)
- Modify: `backend/app/services/keyboard_mapping_service.py` (rewrite)
- Test: `backend/tests/unit/test_keyboard_mapping_service.py` (rewrite)

**Interfaces:**
- Produces: `KeyboardMappingService.get_mappings() -> dict[str,str]`, `set_mappings(mappings: dict[str,str]) -> None`, `set_mapping(key_code: str, action: str) -> None`, `remove_mapping(key_code: str) -> None`, `get_available_actions() -> list[str]` (unchanged).

- [ ] **Step 1: Write the failing tests** — replace the file body's tests (keep `get_available_actions` test if present):

```python
"""Tests for keyboard mapping service."""

import pytest

from app.services.keyboard_mapping_service import KeyboardMappingService


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_and_get_mappings(test_db):
    service = KeyboardMappingService()
    await service.set_mappings({"KEY_1": "generic_prev", "KEY_2": "generic_next"})
    assert await service.get_mappings() == {"KEY_1": "generic_prev", "KEY_2": "generic_next"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_mappings_replaces_existing(test_db):
    service = KeyboardMappingService()
    await service.set_mappings({"KEY_1": "generic_prev"})
    await service.set_mappings({"KEY_3": "generic_next"})
    result = await service.get_mappings()
    assert result == {"KEY_3": "generic_next"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_single_mapping_upserts(test_db):
    service = KeyboardMappingService()
    await service.set_mappings({"KEY_1": "generic_prev"})
    await service.set_mapping("KEY_1", "generic_next")
    await service.set_mapping("KEY_9", "screen_next")
    result = await service.get_mappings()
    assert result == {"KEY_1": "generic_next", "KEY_9": "screen_next"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_remove_mapping(test_db):
    service = KeyboardMappingService()
    await service.set_mappings({"KEY_1": "generic_prev", "KEY_2": "generic_next"})
    await service.remove_mapping("KEY_1")
    assert await service.get_mappings() == {"KEY_2": "generic_next"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_remove_missing_mapping_is_noop(test_db):
    service = KeyboardMappingService()
    await service.set_mappings({"KEY_2": "generic_next"})
    await service.remove_mapping("KEY_1")  # not present
    assert await service.get_mappings() == {"KEY_2": "generic_next"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_keyboard_mapping_service.py -v`
Expected: FAIL (`set_mappings()` still requires `keyboard_type`; `remove_mapping` missing).

- [ ] **Step 3: Drop the model column**

In `backend/app/models/db_models.py`, delete this line from `KeyboardMappingDB`:

```python
    keyboard_type: str = ormar.String(max_length=50, nullable=False)  # '7-button' or 'standard'
```

(Leave `id`, `key_code`, `action`.)

- [ ] **Step 4: Rewrite the service**

Replace the body of `backend/app/services/keyboard_mapping_service.py` above `get_available_actions` (keep `get_available_actions` and the trailing global instance exactly as-is):

```python
"""Service for managing keyboard mappings."""

from app.database import database
from app.models.db_models import KeyboardMappingDB


class KeyboardMappingService:
    """Service for managing keyboard key-to-action mappings (single unified keyboard)."""

    def __init__(self):
        self._cache: dict[str, str] | None = None

    async def get_mappings(self) -> dict[str, str]:
        """Return the full key-code -> action map."""
        if self._cache is not None:
            return self._cache
        rows = await KeyboardMappingDB.objects.all()
        mappings = {row.key_code: row.action for row in rows}
        self._cache = mappings
        return mappings

    async def set_mappings(self, mappings: dict[str, str]) -> None:
        """Replace the entire map atomically."""
        async with database.transaction():
            existing = await KeyboardMappingDB.objects.all()
            for row in existing:
                await row.delete()
            for key_code, action in mappings.items():
                await KeyboardMappingDB.objects.create(key_code=key_code, action=action)
        self._cache = dict(mappings)

    async def set_mapping(self, key_code: str, action: str) -> None:
        """Upsert a single binding."""
        row = await KeyboardMappingDB.objects.get_or_none(key_code=key_code)
        if row:
            row.action = action
            await row.update()
        else:
            await KeyboardMappingDB.objects.create(key_code=key_code, action=action)
        if self._cache is None:
            self._cache = {}
        self._cache[key_code] = action

    async def remove_mapping(self, key_code: str) -> None:
        """Delete a single binding if present."""
        row = await KeyboardMappingDB.objects.get_or_none(key_code=key_code)
        if row:
            await row.delete()
        if self._cache is not None:
            self._cache.pop(key_code, None)

    async def get_available_actions(self) -> list[str]:
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_keyboard_mapping_service.py -v`
Expected: PASS (all 5 + existing `get_available_actions` test).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/db_models.py backend/app/services/keyboard_mapping_service.py backend/tests/unit/test_keyboard_mapping_service.py
git commit -m "refactor(keyboard): flatten mapping service to single unified map (calvin-1bp)"
```

---

### Task 2: Alembic migration — keep active type's rows, drop the column

**Files:**
- Create: `backend/alembic/versions/<hash>_unify_keyboard_mappings.py`
- Test: `backend/tests/integration/test_keyboard_migration.py`

**Interfaces:**
- Consumes: `keyboard_mappings` table (columns `id, keyboard_type, key_code, action`) and `config` table (`key, value`).
- Produces: `keyboard_mappings` with columns `id, key_code, action` and only the active type's rows.

- [ ] **Step 1: Find the current head revision**

Run: `cd backend && uv run alembic heads`
Note the revision id (the `down_revision` for the new migration). If it prints `7b0d79d6ae0c`, use that below.

- [ ] **Step 2: Write the migration**

Create `backend/alembic/versions/b1f0c0ffee01_unify_keyboard_mappings.py` (set `down_revision` to the head from Step 1):

```python
"""Unify keyboard mappings: keep active type's rows, drop keyboard_type.

Revision ID: b1f0c0ffee01
Revises: 7b0d79d6ae0c
Create Date: 2026-07-03
"""

import sqlalchemy as sa
from alembic import op

revision = "b1f0c0ffee01"
down_revision = "7b0d79d6ae0c"
branch_labels = None
depends_on = None


def _active_keyboard_type(conn) -> str:
    """Read the active keyboard type from the config table; default '7-button'."""
    try:
        row = conn.execute(
            sa.text("SELECT value FROM config WHERE key = 'keyboard_type'")
        ).fetchone()
    except Exception:
        return "7-button"
    if not row or row[0] is None:
        return "7-button"
    # config values are stored serialized; strip JSON quotes if present.
    value = str(row[0]).strip().strip('"')
    return value or "7-button"


def upgrade() -> None:
    conn = op.get_bind()
    active = _active_keyboard_type(conn)

    # Keep only the active type's rows. If the active type has no rows,
    # fall back to whatever rows exist (do not wipe the table).
    count = conn.execute(
        sa.text("SELECT COUNT(*) FROM keyboard_mappings WHERE keyboard_type = :t"),
        {"t": active},
    ).scalar()
    if count and count > 0:
        conn.execute(
            sa.text("DELETE FROM keyboard_mappings WHERE keyboard_type != :t"),
            {"t": active},
        )

    with op.batch_alter_table("keyboard_mappings") as batch_op:
        batch_op.drop_column("keyboard_type")


def downgrade() -> None:
    with op.batch_alter_table("keyboard_mappings") as batch_op:
        batch_op.add_column(
            sa.Column("keyboard_type", sa.String(length=50), nullable=False, server_default="7-button")
        )
```

- [ ] **Step 3: Write the migration test**

Create `backend/tests/integration/test_keyboard_migration.py`:

```python
"""Verify the keyboard-mapping unification migration keeps the active type's rows."""

import pytest
import sqlalchemy as sa

from alembic import command
from alembic.config import Config


@pytest.mark.integration
def test_unify_migration_keeps_active_type(tmp_path):
    db_path = tmp_path / "mig.db"
    engine = sa.create_engine(f"sqlite:///{db_path}")

    with engine.begin() as conn:
        conn.execute(sa.text(
            "CREATE TABLE config (id INTEGER PRIMARY KEY, key TEXT, value TEXT, value_type TEXT)"
        ))
        conn.execute(sa.text("INSERT INTO config (key, value) VALUES ('keyboard_type', '\"7-button\"')"))
        conn.execute(sa.text(
            "CREATE TABLE keyboard_mappings "
            "(id INTEGER PRIMARY KEY, keyboard_type TEXT, key_code TEXT, action TEXT)"
        ))
        conn.execute(sa.text(
            "INSERT INTO keyboard_mappings (keyboard_type, key_code, action) VALUES "
            "('7-button','KEY_1','generic_prev'), "
            "('standard','KEY_LEFT','generic_prev')"
        ))
        # Stamp the DB at the down_revision so only our migration runs.
        conn.execute(sa.text(
            "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"
        ))
        conn.execute(sa.text("INSERT INTO alembic_version (version_num) VALUES ('7b0d79d6ae0c')"))

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    command.upgrade(cfg, "b1f0c0ffee01")

    with engine.connect() as conn:
        cols = [c[1] for c in conn.execute(sa.text("PRAGMA table_info(keyboard_mappings)")).fetchall()]
        assert "keyboard_type" not in cols
        rows = conn.execute(sa.text("SELECT key_code, action FROM keyboard_mappings")).fetchall()
        assert rows == [("KEY_1", "generic_prev")]
```

- [ ] **Step 4: Run the migration test**

Run: `cd backend && uv run pytest tests/integration/test_keyboard_migration.py -v`
Expected: PASS (only the active `7-button` row survives; column dropped).

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/b1f0c0ffee01_unify_keyboard_mappings.py backend/tests/integration/test_keyboard_migration.py
git commit -m "feat(keyboard): migration to unify mappings + drop keyboard_type (calvin-1bp)"
```

---

### Task 3: Flatten the keyboard API routes

**Files:**
- Modify: `backend/app/api/routes/keyboard.py` (rewrite handlers)
- Test: `backend/tests/integration/test_api_keyboard.py` (rewrite)

**Interfaces:**
- Produces: `GET /api/keyboard/mappings` → `{"mappings": {KEY: action}}`; `POST /api/keyboard/mappings` body `{"mappings": {KEY: action}}`; `PUT /api/keyboard/mappings/{key_code}` body `{"action": "..."}`; `DELETE /api/keyboard/mappings/{key_code}`; `GET /api/keyboard/actions` unchanged.

- [ ] **Step 1: Rewrite the integration tests**

Replace the `mappings` tests in `backend/tests/integration/test_api_keyboard.py` (keep the `get_available_actions` test):

```python
"""Integration tests for keyboard API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestKeyboardEndpoints:
    def test_get_mappings_is_flat(self, test_client: TestClient):
        response = test_client.get("/api/keyboard/mappings")
        assert response.status_code == 200
        mappings = response.json()["mappings"]
        assert isinstance(mappings, dict)
        # flat: values are action strings, not nested per-type dicts
        assert all(isinstance(v, str) for v in mappings.values())

    def test_post_replaces_mappings(self, test_client: TestClient):
        body = {"mappings": {"KEY_1": "generic_next", "KEY_2": "generic_prev"}}
        response = test_client.post("/api/keyboard/mappings", json=body)
        assert response.status_code == 200
        assert test_client.get("/api/keyboard/mappings").json()["mappings"] == body["mappings"]

    def test_put_single_mapping(self, test_client: TestClient):
        test_client.post("/api/keyboard/mappings", json={"mappings": {"KEY_1": "generic_next"}})
        response = test_client.put("/api/keyboard/mappings/KEY_1", json={"action": "screen_next"})
        assert response.status_code == 200
        assert test_client.get("/api/keyboard/mappings").json()["mappings"]["KEY_1"] == "screen_next"

    def test_delete_single_mapping(self, test_client: TestClient):
        test_client.post("/api/keyboard/mappings", json={"mappings": {"KEY_1": "generic_next", "KEY_2": "generic_prev"}})
        response = test_client.delete("/api/keyboard/mappings/KEY_1")
        assert response.status_code == 200
        remaining = test_client.get("/api/keyboard/mappings").json()["mappings"]
        assert "KEY_1" not in remaining and remaining["KEY_2"] == "generic_prev"

    def test_get_available_actions(self, test_client: TestClient):
        response = test_client.get("/api/keyboard/actions")
        assert response.status_code == 200
        assert isinstance(response.json()["actions"], list)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && uv run pytest tests/integration/test_api_keyboard.py -v`
Expected: FAIL (routes still nested/typed per keyboard_type).

- [ ] **Step 3: Rewrite the routes**

Replace `backend/app/api/routes/keyboard.py` (keep the `/keyboard/actions` handler at the end):

```python
"""Keyboard mapping endpoints (single unified keyboard)."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.keyboard_mapping_service import keyboard_mapping_service

router = APIRouter()


class KeyboardMappings(BaseModel):
    """Full key-code -> action map."""

    mappings: dict[str, str]


class SingleMapping(BaseModel):
    """Action for a single key."""

    action: str


@router.get("/keyboard/mappings")
async def get_keyboard_mappings():
    """Return the full flat mapping."""
    return {"mappings": await keyboard_mapping_service.get_mappings()}


@router.post("/keyboard/mappings")
async def replace_keyboard_mappings(payload: KeyboardMappings):
    """Replace the entire mapping."""
    await keyboard_mapping_service.set_mappings(payload.mappings)
    return {"message": "Keyboard mappings updated", "mappings": payload.mappings}


@router.put("/keyboard/mappings/{key_code}")
async def set_single_mapping(key_code: str, payload: SingleMapping):
    """Upsert a single binding."""
    await keyboard_mapping_service.set_mapping(key_code, payload.action)
    return {"message": "Mapping updated"}


@router.delete("/keyboard/mappings/{key_code}")
async def delete_single_mapping(key_code: str):
    """Remove a single binding."""
    await keyboard_mapping_service.remove_mapping(key_code)
    return {"message": "Mapping removed"}


@router.get("/keyboard/actions")
async def get_available_actions():
    """Get list of available keyboard actions."""
    actions = await keyboard_mapping_service.get_available_actions()
    return {"actions": actions}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && uv run pytest tests/integration/test_api_keyboard.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/keyboard.py backend/tests/integration/test_api_keyboard.py
git commit -m "refactor(keyboard): flat mapping API with per-key PUT/DELETE (calvin-1bp)"
```

---

### Task 4: Single-map seed + remove `keyboardType` from config

**Files:**
- Modify: `backend/app/main.py:207-247` (`_initialize_keyboard_mappings`), and `:305` / `:322-323` defaults referencing `keyboard_type`
- Modify: `backend/app/api/routes/config.py:102` and `:226-229`, `:544-545` (remove `keyboardType`)
- Test: `backend/tests/integration/test_api_keyboard.py` (add seed test)

**Interfaces:**
- Consumes: `keyboard_mapping_service.get_mappings()`, `set_mappings(map)` (Task 1).

- [ ] **Step 1: Add a seed test**

Append to `backend/tests/integration/test_api_keyboard.py`:

```python
@pytest.mark.integration
def test_default_seed_present(test_client: TestClient):
    """A fresh DB seeds the canonical 7-button default map."""
    mappings = test_client.get("/api/keyboard/mappings").json()["mappings"]
    assert mappings.get("KEY_1") == "generic_prev"
    assert mappings.get("KEY_7") == "mode_settings"
```

- [ ] **Step 2: Run to verify (may already pass or fail depending on seed)**

Run: `cd backend && uv run pytest tests/integration/test_api_keyboard.py::test_default_seed_present -v`
Expected: FAIL or ERROR until the seed is flattened.

- [ ] **Step 3: Rewrite the seed**

Replace `_initialize_keyboard_mappings` in `backend/app/main.py`:

```python
DEFAULT_KEYBOARD_MAPPINGS = {
    "KEY_1": "generic_prev",
    "KEY_2": "generic_expand_close",
    "KEY_3": "generic_next",
    "KEY_4": "region_next",
    "KEY_5": "screen_prev",
    "KEY_6": "screen_next",
    "KEY_7": "mode_settings",
}


async def _initialize_keyboard_mappings():
    """Seed the default keyboard mapping if none exist."""
    from app.services.keyboard_mapping_service import keyboard_mapping_service

    if not await keyboard_mapping_service.get_mappings():
        await keyboard_mapping_service.set_mappings(DEFAULT_KEYBOARD_MAPPINGS)
        logger.info("Initialized default keyboard mappings")
```

- [ ] **Step 4: Remove `keyboard_type` from main.py default config**

In `backend/app/main.py`, delete the `"keyboard_type": "7-button",` line (~line 305) from the default-config dict. Leave `reboot_combo_key1`/`reboot_combo_key2` untouched.

- [ ] **Step 5: Remove `keyboardType` from config route**

In `backend/app/api/routes/config.py`:
- Delete the field `keyboardType: str | None = None` (~line 102).
- Delete the block that defaults `config["keyboardType"]` (~lines 226-229).
- Delete the snake_case remap block (~lines 544-545):
  ```python
  if "keyboardType" in update_dict:
      update_dict["keyboard_type"] = update_dict.pop("keyboardType")
  ```

- [ ] **Step 6: Run keyboard + config tests**

Run: `cd backend && uv run pytest tests/integration/test_api_keyboard.py tests/integration/test_api_config.py -v`
Expected: PASS (add `test_api_config.py` only if it exists; otherwise run keyboard tests alone).

- [ ] **Step 7: Full backend gate**

Run: `cd backend && uv run pytest -q && uv run ruff check . && uv run mypy app`
Expected: PASS / no errors. Fix any lingering `keyboard_type` references the type checker surfaces.

- [ ] **Step 8: Commit**

```bash
git add backend/app/main.py backend/app/api/routes/config.py backend/tests/integration/test_api_keyboard.py
git commit -m "refactor(keyboard): single-map seed; drop keyboardType from config (calvin-1bp)"
```

---

## Phase B — Frontend: shared utils, store, handler

### Task 5: Shared `normalizeKeyCode`

**Files:**
- Create: `frontend/src/utils/keyCode.js`
- Test: `frontend/tests/unit/utils/keyCode.spec.js`

**Interfaces:**
- Produces: `normalizeKeyCode(event: {code?: string, key?: string}) -> string` returning a `KEY_*` code.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/utils/keyCode.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { normalizeKeyCode } from "@/utils/keyCode";

describe("normalizeKeyCode", () => {
  it("maps digits", () => {
    expect(normalizeKeyCode({ code: "Digit3" })).toBe("KEY_3");
  });
  it("maps letters", () => {
    expect(normalizeKeyCode({ code: "KeyS" })).toBe("KEY_S");
  });
  it("maps function keys", () => {
    expect(normalizeKeyCode({ code: "F5" })).toBe("KEY_F5");
  });
  it("maps named specials", () => {
    expect(normalizeKeyCode({ code: "ArrowLeft" })).toBe("KEY_LEFT");
    expect(normalizeKeyCode({ code: "Space" })).toBe("KEY_SPACE");
    expect(normalizeKeyCode({ code: "Escape" })).toBe("KEY_ESCAPE");
  });
  it("uppercases unknown codes into KEY_ form", () => {
    expect(normalizeKeyCode({ code: "Comma" })).toBe("KEY_COMMA");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run tests/unit/utils/keyCode.spec.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/utils/keyCode.js`:

```javascript
// Named specials whose event.code doesn't follow a regular family pattern.
const NAMED = {
  ArrowRight: "KEY_RIGHT",
  ArrowLeft: "KEY_LEFT",
  ArrowUp: "KEY_UP",
  ArrowDown: "KEY_DOWN",
  Space: "KEY_SPACE",
  Enter: "KEY_ENTER",
  Escape: "KEY_ESCAPE",
  Home: "KEY_HOME",
  End: "KEY_END",
  PageUp: "KEY_PAGEUP",
  PageDown: "KEY_PAGEDOWN",
  Backspace: "KEY_BACKSPACE",
  Tab: "KEY_TAB",
  Delete: "KEY_DELETE",
  Insert: "KEY_INSERT",
};

/**
 * Normalize a browser KeyboardEvent to Calvin's KEY_* code.
 * Shared by runtime resolution (KeyboardHandler) and press-to-capture so
 * stored and resolved codes always match.
 * @param {{code?: string, key?: string}} event
 * @returns {string}
 */
export function normalizeKeyCode(event) {
  const code = event?.code || event?.key || "";
  if (NAMED[code]) return NAMED[code];

  const digit = code.match(/^Digit(\d)$/);
  if (digit) return `KEY_${digit[1]}`;

  const numpad = code.match(/^Numpad(\d)$/);
  if (numpad) return `KEY_${numpad[1]}`;

  const letter = code.match(/^Key([A-Z])$/);
  if (letter) return `KEY_${letter[1]}`;

  const fkey = code.match(/^F(\d{1,2})$/);
  if (fkey) return `KEY_F${fkey[1]}`;

  // Fallback: uppercase the raw code into KEY_ form (e.g. Comma -> KEY_COMMA).
  return `KEY_${code.toUpperCase()}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run tests/unit/utils/keyCode.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/keyCode.js frontend/tests/unit/utils/keyCode.spec.js
git commit -m "feat(keyboard): shared normalizeKeyCode util (calvin-1bp)"
```

---

### Task 6: Action catalog (UI-only picker metadata)

**Files:**
- Create: `frontend/src/utils/keyboardActionsCatalog.js`
- Test: `frontend/tests/unit/utils/keyboardActionsCatalog.spec.js`

**Interfaces:**
- Produces:
  - `ACTION_GROUPS` — ordered array of `{ id, label, tier: "recommended"|"primary"|"collapsed", actions: [{ value, label, description? }] }`.
  - `actionLabel(value: string) -> string` — human label for any action value (falls back to the raw value).
  - `ALL_ACTION_VALUES` — flat array of every action value in the catalog.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/utils/keyboardActionsCatalog.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { ACTION_GROUPS, actionLabel, ALL_ACTION_VALUES } from "@/utils/keyboardActionsCatalog";

describe("keyboardActionsCatalog", () => {
  it("puts the generic group first and marks it recommended", () => {
    expect(ACTION_GROUPS[0].id).toBe("generic");
    expect(ACTION_GROUPS[0].tier).toBe("recommended");
    const values = ACTION_GROUPS[0].actions.map(a => a.value);
    expect(values).toEqual([
      "generic_next",
      "generic_prev",
      "generic_expand_close",
      "generic_refresh",
    ]);
  });

  it("has no 'Modes' group; open-settings lives under navigation", () => {
    expect(ACTION_GROUPS.some(g => g.id === "modes")).toBe(false);
    const nav = ACTION_GROUPS.find(g => g.id === "navigation");
    expect(nav.actions.map(a => a.value)).toContain("mode_settings");
  });

  it("lists every value exactly once", () => {
    const set = new Set(ALL_ACTION_VALUES);
    expect(set.size).toBe(ALL_ACTION_VALUES.length);
  });

  it("resolves labels and falls back to the raw value", () => {
    expect(actionLabel("generic_next")).toBe("Next");
    expect(actionLabel("totally_unknown")).toBe("totally_unknown");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run tests/unit/utils/keyboardActionsCatalog.spec.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/utils/keyboardActionsCatalog.js`:

```javascript
// UI-only presentation metadata for the frozen keyboard action vocabulary
// (see composables/useKeyboardActions.js). Grouping/labels live here; the
// action VALUES must stay in lockstep with the frozen handler.

export const ACTION_GROUPS = [
  {
    id: "generic",
    label: "Generic · context-aware",
    tier: "recommended",
    actions: [
      { value: "generic_next", label: "Next", description: "adapts to the focused region" },
      { value: "generic_prev", label: "Previous", description: "adapts to the focused region" },
      { value: "generic_expand_close", label: "Expand / Close", description: "expand event · enter/exit fullscreen" },
      { value: "generic_refresh", label: "Refresh", description: "refresh the focused region" },
    ],
  },
  {
    id: "navigation",
    label: "Navigation",
    tier: "primary",
    actions: [
      { value: "screen_next", label: "Screen Next" },
      { value: "screen_prev", label: "Screen Previous" },
      { value: "region_next", label: "Region Next" },
      { value: "region_prev", label: "Region Previous" },
      { value: "screen_1", label: "Screen 1" },
      { value: "screen_2", label: "Screen 2" },
      { value: "screen_3", label: "Screen 3" },
      { value: "screen_4", label: "Screen 4" },
      { value: "screen_5", label: "Screen 5" },
      { value: "screen_6", label: "Screen 6" },
      { value: "screen_7", label: "Screen 7" },
      { value: "mode_settings", label: "Open Settings" },
    ],
  },
  {
    id: "jump",
    label: "Jump to a screen",
    tier: "collapsed",
    actions: [
      { value: "mode_calendar", label: "Calendar screen", description: "first screen with a calendar region" },
      { value: "mode_photos", label: "Photos screen" },
      { value: "mode_web_services", label: "Services screen" },
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    tier: "collapsed",
    actions: [
      { value: "calendar_next", label: "Calendar: Next" },
      { value: "calendar_prev", label: "Calendar: Previous" },
      { value: "calendar_expand", label: "Calendar: Expand" },
      { value: "calendar_collapse", label: "Calendar: Collapse" },
      { value: "calendar_refresh", label: "Calendar: Refresh" },
      { value: "calendar_enter_fullscreen", label: "Calendar: Enter Fullscreen" },
      { value: "calendar_exit_fullscreen", label: "Calendar: Exit Fullscreen" },
    ],
  },
  {
    id: "photos",
    label: "Photos",
    tier: "collapsed",
    actions: [
      { value: "images_next", label: "Photos: Next" },
      { value: "images_prev", label: "Photos: Previous" },
      { value: "photos_enter_fullscreen", label: "Photos: Enter Fullscreen" },
      { value: "photos_exit_fullscreen", label: "Photos: Exit Fullscreen" },
    ],
  },
  {
    id: "services",
    label: "Web Services",
    tier: "collapsed",
    actions: [
      { value: "web_service_next", label: "Service: Next" },
      { value: "web_service_prev", label: "Service: Previous" },
      { value: "web_service_close", label: "Service: Close" },
      { value: "web_service_1", label: "Web Service 1" },
      { value: "web_service_2", label: "Web Service 2" },
      { value: "service_refresh", label: "Service: Refresh" },
    ],
  },
  {
    id: "legacy",
    label: "Legacy / advanced",
    tier: "collapsed",
    actions: [
      { value: "mode_cycle", label: "Cycle modes (legacy)" },
      { value: "mode_spare", label: "Spare (no action)" },
      { value: "calendar_next_month", label: "Calendar: Next Month (legacy)" },
      { value: "calendar_prev_month", label: "Calendar: Previous Month (legacy)" },
      { value: "calendar_expand_today", label: "Calendar: Expand Today (legacy)" },
      { value: "none", label: "No Action" },
    ],
  },
];

export const ALL_ACTION_VALUES = ACTION_GROUPS.flatMap(g => g.actions.map(a => a.value));

const LABELS = Object.fromEntries(
  ACTION_GROUPS.flatMap(g => g.actions.map(a => [a.value, a.label]))
);

export function actionLabel(value) {
  return LABELS[value] || value;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run tests/unit/utils/keyboardActionsCatalog.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/keyboardActionsCatalog.js frontend/tests/unit/utils/keyboardActionsCatalog.spec.js
git commit -m "feat(keyboard): UI action catalog for grouped picker (calvin-1bp)"
```

---

### Task 7: Flatten the keyboard store + add capture primitives

**Files:**
- Modify: `frontend/src/stores/keyboard.js` (rewrite)
- Test: `frontend/tests/unit/stores/keyboard.spec.js` (rewrite)

**Interfaces:**
- Produces on the store:
  - state: `mappings` (flat `{KEY: action}`), `available`, `loading`, `error`, `captureActive`.
  - `fetchMappings() -> Promise`, `setMapping(key, action) -> Promise`, `removeMapping(key) -> Promise`, `updateMappings(map) -> Promise`.
  - capture: `beginCapture() -> Promise<string|null>`, `handleCaptureKey(keyCode)`, `cancelCapture()`.

- [ ] **Step 1: Rewrite the store test**

Replace `frontend/tests/unit/stores/keyboard.spec.js`:

```javascript
/** Tests for keyboard store. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useKeyboardStore } from "@/stores/keyboard";
import axios from "axios";

vi.mock("axios");

describe("Keyboard Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("initializes with a flat empty map", () => {
    const store = useKeyboardStore();
    expect(store.mappings).toEqual({});
    expect(store.captureActive).toBe(false);
  });

  it("fetchMappings stores the flat map", async () => {
    axios.get.mockResolvedValue({ data: { mappings: { KEY_1: "generic_prev" } } });
    const store = useKeyboardStore();
    await store.fetchMappings();
    expect(store.mappings).toEqual({ KEY_1: "generic_prev" });
    expect(axios.get).toHaveBeenCalledWith("/api/keyboard/mappings");
  });

  it("setMapping PUTs a single key and updates local state", async () => {
    axios.put.mockResolvedValue({ data: {} });
    const store = useKeyboardStore();
    await store.setMapping("KEY_2", "generic_next");
    expect(axios.put).toHaveBeenCalledWith("/api/keyboard/mappings/KEY_2", { action: "generic_next" });
    expect(store.mappings.KEY_2).toBe("generic_next");
  });

  it("removeMapping DELETEs a key and drops it locally", async () => {
    axios.delete.mockResolvedValue({ data: {} });
    const store = useKeyboardStore();
    store.mappings.KEY_2 = "generic_next";
    await store.removeMapping("KEY_2");
    expect(axios.delete).toHaveBeenCalledWith("/api/keyboard/mappings/KEY_2");
    expect(store.mappings.KEY_2).toBeUndefined();
  });

  it("beginCapture resolves with the captured key", async () => {
    const store = useKeyboardStore();
    const p = store.beginCapture();
    expect(store.captureActive).toBe(true);
    store.handleCaptureKey("KEY_S");
    await expect(p).resolves.toBe("KEY_S");
    expect(store.captureActive).toBe(false);
  });

  it("Escape cancels capture and resolves null", async () => {
    const store = useKeyboardStore();
    const p = store.beginCapture();
    store.handleCaptureKey("KEY_ESCAPE");
    await expect(p).resolves.toBeNull();
    expect(store.captureActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run tests/unit/stores/keyboard.spec.js`
Expected: FAIL.

- [ ] **Step 3: Rewrite the store**

Replace `frontend/src/stores/keyboard.js`:

```javascript
import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import { logError } from "@/utils/logger";

export const useKeyboardStore = defineStore("keyboard", () => {
  const mappings = ref({}); // { KEY_x: action }
  const available = ref(false);
  const loading = ref(false);
  const error = ref(null);

  const captureActive = ref(false);
  let captureResolver = null;

  const fetchMappings = async () => {
    loading.value = true;
    error.value = null;
    try {
      const response = await axios.get("/api/keyboard/mappings");
      mappings.value = response.data.mappings || {};
      available.value = true;
      return response.data;
    } catch (err) {
      error.value = err.message;
      available.value = false;
      logError("[Keyboard]", "Failed to fetch mappings:", err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const setMapping = async (key, action) => {
    await axios.put(`/api/keyboard/mappings/${key}`, { action });
    mappings.value = { ...mappings.value, [key]: action };
  };

  const removeMapping = async key => {
    await axios.delete(`/api/keyboard/mappings/${key}`);
    const next = { ...mappings.value };
    delete next[key];
    mappings.value = next;
  };

  const updateMappings = async map => {
    await axios.post("/api/keyboard/mappings", { mappings: map });
    mappings.value = { ...map };
  };

  // --- press-to-capture primitives ---
  const beginCapture = () => {
    captureActive.value = true;
    return new Promise(resolve => {
      captureResolver = resolve;
    });
  };

  const handleCaptureKey = keyCode => {
    if (!captureActive.value) return;
    captureActive.value = false;
    const resolve = captureResolver;
    captureResolver = null;
    // Escape is reserved to cancel.
    resolve?.(keyCode === "KEY_ESCAPE" ? null : keyCode);
  };

  const cancelCapture = () => {
    if (!captureActive.value) return;
    captureActive.value = false;
    const resolve = captureResolver;
    captureResolver = null;
    resolve?.(null);
  };

  return {
    mappings,
    available,
    loading,
    error,
    captureActive,
    fetchMappings,
    setMapping,
    removeMapping,
    updateMappings,
    beginCapture,
    handleCaptureKey,
    cancelCapture,
  };
});
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run tests/unit/stores/keyboard.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/keyboard.js frontend/tests/unit/stores/keyboard.spec.js
git commit -m "refactor(keyboard): flat store + capture primitives (calvin-1bp)"
```

---

### Task 8: Update `KeyboardHandler` for flat resolve + capture intercept

**Files:**
- Modify: `frontend/src/components/KeyboardHandler.vue:33-53` (remove `keyCodeMap`), `:101-140` (`onKeyDown`)

**Interfaces:**
- Consumes: `normalizeKeyCode` (Task 5); `keyboardStore.mappings`, `keyboardStore.captureActive`, `keyboardStore.handleCaptureKey` (Task 7).

- [ ] **Step 1: Import the normalizer**

At the top of `<script setup>` in `frontend/src/components/KeyboardHandler.vue`, add:

```javascript
import { normalizeKeyCode } from "@/utils/keyCode";
```

- [ ] **Step 2: Remove the inline `keyCodeMap`**

Delete the entire `const keyCodeMap = { ... };` block (lines ~33-53).

- [ ] **Step 3: Rewrite the head of `onKeyDown`**

In `onKeyDown`, replace the INPUT guard's following lines through the `const action = mappings[keyCode];` lookup. The function head becomes:

```javascript
const onKeyDown = async event => {
  // Don't handle if user is typing in an input/textarea
  if (
    event.target.tagName === "INPUT" ||
    event.target.tagName === "TEXTAREA" ||
    event.target.isContentEditable
  ) {
    return;
  }

  const keyCode = normalizeKeyCode(event);

  // Capture mode (settings remap): swallow the key, bind it, dispatch nothing.
  if (keyboardStore.captureActive) {
    event.preventDefault();
    keyboardStore.handleCaptureKey(keyCode);
    return;
  }

  // Track pressed keys for reboot combo
  pressedKeys.add(keyCode);
  checkRebootCombo();

  // Find action for this key (single unified map)
  const mappings = keyboardStore.mappings || {};
  const action = mappings[keyCode];
```

Leave the rest of `onKeyDown` (the `if (action && action !== "none")` block, notification feedback, `handleAction(action)`, inactivity timer) unchanged. Also update the second `normalizeKeyCode` site (formerly `keyCodeMap[event.code]`) in `onKeyUp` at line ~145 to `const keyCode = normalizeKeyCode(event);`.

- [ ] **Step 4: Verify no `keyCodeMap` / `keyboardType` references remain**

Run: `cd frontend && grep -n "keyCodeMap\|keyboardType\|mappings\[keyboardType\]" src/components/KeyboardHandler.vue`
Expected: no output.

- [ ] **Step 5: Run the keyboard-related unit + e2e specs**

Run: `cd frontend && npx vitest run tests/unit/composables/useKeyboardActions.spec.js tests/unit/stores/keyboard.spec.js`
Expected: PASS (frozen action behavior unchanged; store flat).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/KeyboardHandler.vue
git commit -m "refactor(keyboard): resolve via shared normalizer + flat map; capture intercept (calvin-1bp)"
```

---

## Phase C — Editor components

### Task 9: `useKeyCapture` composable

**Files:**
- Create: `frontend/src/composables/useKeyCapture.js`
- Test: `frontend/tests/unit/composables/useKeyCapture.spec.js`

**Interfaces:**
- Consumes: `useKeyboardStore().beginCapture()`, `cancelCapture()`, `captureActive` (Task 7).
- Produces: `useKeyCapture()` → `{ capturing: Ref<boolean>, capture(): Promise<string|null>, cancel(): void }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/composables/useKeyCapture.spec.js`:

```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useKeyCapture } from "@/composables/useKeyCapture";
import { useKeyboardStore } from "@/stores/keyboard";

describe("useKeyCapture", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("capture() resolves when the store receives a key", async () => {
    const store = useKeyboardStore();
    const { capture, capturing } = useKeyCapture();
    const p = capture();
    expect(capturing.value).toBe(true);
    store.handleCaptureKey("KEY_4");
    await expect(p).resolves.toBe("KEY_4");
    expect(capturing.value).toBe(false);
  });

  it("cancel() aborts an active capture", async () => {
    const { capture, cancel } = useKeyCapture();
    const p = capture();
    cancel();
    await expect(p).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run tests/unit/composables/useKeyCapture.spec.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/composables/useKeyCapture.js`:

```javascript
import { computed, onBeforeUnmount } from "vue";
import { useKeyboardStore } from "@/stores/keyboard";

/**
 * Thin wrapper over the keyboard store's capture primitives.
 * KeyboardHandler is the actual key listener; it routes the next keydown to
 * store.handleCaptureKey while capture is active. This composable just exposes
 * an awaitable capture() and guarantees cleanup on unmount.
 */
export function useKeyCapture() {
  const store = useKeyboardStore();
  const capturing = computed(() => store.captureActive);

  const capture = () => store.beginCapture();
  const cancel = () => store.cancelCapture();

  onBeforeUnmount(() => {
    if (store.captureActive) store.cancelCapture();
  });

  return { capturing, capture, cancel };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run tests/unit/composables/useKeyCapture.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useKeyCapture.js frontend/tests/unit/composables/useKeyCapture.spec.js
git commit -m "feat(keyboard): useKeyCapture composable (calvin-1bp)"
```

---

### Task 10: `ActionPicker` popover

**Files:**
- Create: `frontend/src/components/settings/tabs/layout/keyboard/ActionPicker.vue`
- Test: `frontend/tests/unit/components/keyboard/ActionPicker.spec.js`

**Interfaces:**
- Consumes: `ACTION_GROUPS`, `actionLabel` (Task 6).
- Props: `keyCode: String`, `currentAction: String|null`.
- Emits: `select` (action value string), `close`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/keyboard/ActionPicker.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ActionPicker from "@/components/settings/tabs/layout/keyboard/ActionPicker.vue";

describe("ActionPicker", () => {
  it("shows the captured key and generic actions first", () => {
    const w = mount(ActionPicker, { props: { keyCode: "KEY_4", currentAction: null } });
    expect(w.text()).toContain("KEY_4");
    const first = w.find(".ap-group");
    expect(first.text()).toContain("Generic");
    expect(first.text()).toContain("Next");
  });

  it("emits select with the action value", async () => {
    const w = mount(ActionPicker, { props: { keyCode: "KEY_4", currentAction: null } });
    await w.find('[data-action="generic_next"]').trigger("click");
    expect(w.emitted("select")[0]).toEqual(["generic_next"]);
  });

  it("filters actions by search text", async () => {
    const w = mount(ActionPicker, { props: { keyCode: "KEY_4", currentAction: null } });
    await w.find("input.ap-search").setValue("refresh");
    expect(w.text().toLowerCase()).toContain("refresh");
    expect(w.find('[data-action="generic_next"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run tests/unit/components/keyboard/ActionPicker.spec.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `frontend/src/components/settings/tabs/layout/keyboard/ActionPicker.vue`:

```vue
<template>
  <div class="ap calvin-plugin-surface" role="dialog" aria-label="Choose keyboard action">
    <header class="ap-head">
      <span class="ap-key">{{ keyCode }}</span>
      <span class="ap-arrow">→</span>
      <span class="ap-lbl">choose an action</span>
      <button class="ap-close" aria-label="Cancel" @click="$emit('close')">×</button>
    </header>

    <input
      v-model="query"
      class="ap-search"
      type="text"
      placeholder="Search actions…"
      aria-label="Search actions"
    />

    <div class="ap-scroll">
      <section
        v-for="group in visibleGroups"
        :key="group.id"
        class="ap-group"
        :class="{ 'ap-group--reco': group.tier === 'recommended' }"
      >
        <h4 class="ap-group-title">
          <span v-if="group.tier === 'recommended'" class="ap-star">★</span>
          {{ group.label }}
        </h4>
        <button
          v-for="a in group.actions"
          :key="a.value"
          class="ap-opt"
          :class="{ 'ap-opt--current': a.value === currentAction }"
          :data-action="a.value"
          @click="$emit('select', a.value)"
        >
          <span class="ap-opt-label">{{ a.label }}</span>
          <span v-if="a.description" class="ap-opt-desc">{{ a.description }}</span>
        </button>
      </section>
      <p v-if="visibleGroups.length === 0" class="ap-empty">No matching actions.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { ACTION_GROUPS } from "@/utils/keyboardActionsCatalog";

defineProps({
  keyCode: { type: String, required: true },
  currentAction: { type: String, default: null },
});
defineEmits(["select", "close"]);

const query = ref("");

const visibleGroups = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return ACTION_GROUPS;
  return ACTION_GROUPS.map(g => ({
    ...g,
    actions: g.actions.filter(
      a => a.label.toLowerCase().includes(q) || a.value.toLowerCase().includes(q)
    ),
  })).filter(g => g.actions.length > 0);
});
</script>

<style scoped>
.ap {
  width: 100%;
  max-width: 440px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}
.ap-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-2);
}
.ap-key {
  font-family: var(--font-data);
  font-weight: 700;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 3px 12px;
  color: var(--ink);
}
.ap-arrow { color: var(--ink-2); }
.ap-lbl { color: var(--ink-2); flex: 1; }
.ap-close {
  background: none;
  border: none;
  color: var(--ink-2);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}
.ap-search {
  margin: 10px 14px 6px;
  padding: 7px 10px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink);
  font-family: var(--font-ui);
}
.ap-scroll { overflow-y: auto; padding: 4px 14px 12px; }
.ap-group-title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-2);
  margin: 12px 0 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ap-star { color: var(--warn); }
.ap-opt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  text-align: left;
  gap: 2px;
  padding: 8px 10px;
  margin-bottom: 4px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink);
  cursor: pointer;
  min-height: 44px;
}
.ap-group--reco .ap-opt { border-color: var(--focus); }
.ap-opt:hover { border-color: var(--focus); }
.ap-opt--current { outline: 2px solid var(--focus); outline-offset: 1px; }
.ap-opt-desc { font-size: 0.72rem; color: var(--ink-2); }
.ap-empty { color: var(--ink-2); padding: 12px 4px; }
</style>
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run tests/unit/components/keyboard/ActionPicker.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/tabs/layout/keyboard/ActionPicker.vue frontend/tests/unit/components/keyboard/ActionPicker.spec.js
git commit -m "feat(keyboard): grouped generic-first ActionPicker (calvin-1bp)"
```

---

### Task 11: `KeyBindingTile`

**Files:**
- Create: `frontend/src/components/settings/tabs/layout/keyboard/KeyBindingTile.vue`
- Test: `frontend/tests/unit/components/keyboard/KeyBindingTile.spec.js`

**Interfaces:**
- Consumes: `actionLabel` (Task 6).
- Props: `keyCode: String`, `action: String|null`, `conflict: Boolean` (default false).
- Emits: `edit`, `clear`.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/keyboard/KeyBindingTile.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import KeyBindingTile from "@/components/settings/tabs/layout/keyboard/KeyBindingTile.vue";

describe("KeyBindingTile", () => {
  it("renders the key label and action label", () => {
    const w = mount(KeyBindingTile, { props: { keyCode: "KEY_1", action: "generic_next" } });
    expect(w.text()).toContain("1");
    expect(w.text()).toContain("Next");
  });

  it("shows 'unassigned' when no action", () => {
    const w = mount(KeyBindingTile, { props: { keyCode: "KEY_1", action: null } });
    expect(w.text().toLowerCase()).toContain("unassigned");
  });

  it("emits edit and clear", async () => {
    const w = mount(KeyBindingTile, { props: { keyCode: "KEY_1", action: "generic_next" } });
    await w.find('[data-role="edit"]').trigger("click");
    await w.find('[data-role="clear"]').trigger("click");
    expect(w.emitted("edit")).toBeTruthy();
    expect(w.emitted("clear")).toBeTruthy();
  });

  it("flags a conflict", () => {
    const w = mount(KeyBindingTile, { props: { keyCode: "KEY_1", action: "generic_next", conflict: true } });
    expect(w.find(".kbt--conflict").exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run tests/unit/components/keyboard/KeyBindingTile.spec.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `frontend/src/components/settings/tabs/layout/keyboard/KeyBindingTile.vue`:

```vue
<template>
  <div class="kbt" :class="{ 'kbt--conflict': conflict, 'kbt--empty': !action }">
    <div class="kbt-key">{{ keyLabel }}</div>
    <div class="kbt-action">{{ action ? actionLabel(action) : "unassigned" }}</div>
    <div class="kbt-actions">
      <button class="kbt-btn" data-role="edit" :aria-label="`Change ${keyLabel}`" @click="$emit('edit')">✎</button>
      <button v-if="action" class="kbt-btn" data-role="clear" :aria-label="`Clear ${keyLabel}`" @click="$emit('clear')">×</button>
    </div>
    <span v-if="conflict" class="kbt-conflict-dot" title="This action is also bound to another key">●</span>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { actionLabel } from "@/utils/keyboardActionsCatalog";

const props = defineProps({
  keyCode: { type: String, required: true },
  action: { type: String, default: null },
  conflict: { type: Boolean, default: false },
});
defineEmits(["edit", "clear"]);

const keyLabel = computed(() => props.keyCode.replace(/^KEY_/, ""));
</script>

<style scoped>
.kbt {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  min-height: 44px;
}
.kbt--empty { border-style: dashed; }
.kbt--conflict { border-color: var(--warn); }
.kbt-key {
  font-family: var(--font-data);
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--ink);
}
.kbt-action { font-size: 0.75rem; color: var(--ink-2); text-align: center; line-height: 1.2; }
.kbt-actions { display: flex; gap: 6px; }
.kbt-btn {
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--ink-2);
  width: 28px;
  height: 28px;
  cursor: pointer;
}
.kbt-btn:hover { border-color: var(--focus); color: var(--ink); }
.kbt-conflict-dot { position: absolute; top: 6px; right: 8px; color: var(--warn); font-size: 0.6rem; }
</style>
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run tests/unit/components/keyboard/KeyBindingTile.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/tabs/layout/keyboard/KeyBindingTile.vue frontend/tests/unit/components/keyboard/KeyBindingTile.spec.js
git commit -m "feat(keyboard): KeyBindingTile with conflict indicator (calvin-1bp)"
```

---

### Task 12: `KeyBindingBoard`

**Files:**
- Create: `frontend/src/components/settings/tabs/layout/keyboard/KeyBindingBoard.vue`
- Test: `frontend/tests/unit/components/keyboard/KeyBindingBoard.spec.js`

**Interfaces:**
- Consumes: `KeyBindingTile` (Task 11).
- Props: `mappings: Object` (`{KEY: action}`), `capturing: Boolean`.
- Emits: `edit` (keyCode), `clear` (keyCode), `add` (start capture for a new key).
- Behavior: always renders tiles for `KEY_1..KEY_7`; any bound key outside that set appears in an "Other keys" strip.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/keyboard/KeyBindingBoard.spec.js`:

```javascript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import KeyBindingBoard from "@/components/settings/tabs/layout/keyboard/KeyBindingBoard.vue";

describe("KeyBindingBoard", () => {
  it("renders 7 device tiles for KEY_1..KEY_7", () => {
    const w = mount(KeyBindingBoard, { props: { mappings: { KEY_1: "generic_prev" }, capturing: false } });
    expect(w.findAll(".kb-board .kbt").length).toBe(7);
  });

  it("lists non-1..7 keys under Other keys", () => {
    const w = mount(KeyBindingBoard, { props: { mappings: { KEY_S: "mode_settings" }, capturing: false } });
    expect(w.find(".kb-other").text()).toContain("S");
  });

  it("emits add when the capture button is clicked", async () => {
    const w = mount(KeyBindingBoard, { props: { mappings: {}, capturing: false } });
    await w.find('[data-role="add"]').trigger("click");
    expect(w.emitted("add")).toBeTruthy();
  });

  it("flags conflicts when an action is bound to two keys", () => {
    const w = mount(KeyBindingBoard, {
      props: { mappings: { KEY_1: "generic_next", KEY_2: "generic_next" }, capturing: false },
    });
    expect(w.findAll(".kbt--conflict").length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run tests/unit/components/keyboard/KeyBindingBoard.spec.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `frontend/src/components/settings/tabs/layout/keyboard/KeyBindingBoard.vue`:

```vue
<template>
  <div class="kb">
    <p class="kb-head">Your buttons</p>
    <div class="kb-board">
      <KeyBindingTile
        v-for="key in DEVICE_KEYS"
        :key="key"
        :key-code="key"
        :action="mappings[key] || null"
        :conflict="isConflict(key)"
        @edit="$emit('edit', key)"
        @clear="$emit('clear', key)"
      />
    </div>

    <div class="kb-other">
      <p class="kb-head">Other keys · {{ otherKeys.length }}</p>
      <div class="kb-other-list">
        <KeyBindingTile
          v-for="key in otherKeys"
          :key="key"
          :key-code="key"
          :action="mappings[key] || null"
          :conflict="isConflict(key)"
          @edit="$emit('edit', key)"
          @clear="$emit('clear', key)"
        />
        <button class="kb-add" data-role="add" :disabled="capturing" @click="$emit('add')">
          {{ capturing ? "Press a button…" : "＋ Press a button to bind" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import KeyBindingTile from "./KeyBindingTile.vue";

const DEVICE_KEYS = ["KEY_1", "KEY_2", "KEY_3", "KEY_4", "KEY_5", "KEY_6", "KEY_7"];

const props = defineProps({
  mappings: { type: Object, required: true },
  capturing: { type: Boolean, default: false },
});
defineEmits(["edit", "clear", "add"]);

const otherKeys = computed(() =>
  Object.keys(props.mappings)
    .filter(k => !DEVICE_KEYS.includes(k))
    .sort()
);

// An action is in conflict when >1 key maps to it (excluding "none").
const actionCounts = computed(() => {
  const counts = {};
  for (const action of Object.values(props.mappings)) {
    if (action && action !== "none") counts[action] = (counts[action] || 0) + 1;
  }
  return counts;
});

const isConflict = key => {
  const action = props.mappings[key];
  return !!action && action !== "none" && actionCounts.value[action] > 1;
};
</script>

<style scoped>
.kb-head {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-2);
  margin: 4px 0 8px;
}
.kb-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 8px;
}
.kb-other { margin-top: 16px; }
.kb-other-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: stretch;
}
.kb-other-list .kbt { min-width: 96px; }
.kb-add {
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: var(--bg-2);
  color: var(--ink-2);
  padding: 10px 14px;
  cursor: pointer;
  min-height: 44px;
}
.kb-add:hover:not(:disabled) { border-color: var(--focus); color: var(--ink); }
.kb-add:disabled { opacity: 0.7; cursor: default; }
</style>
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run tests/unit/components/keyboard/KeyBindingBoard.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/tabs/layout/keyboard/KeyBindingBoard.vue frontend/tests/unit/components/keyboard/KeyBindingBoard.spec.js
git commit -m "feat(keyboard): device board with Other-keys strip (calvin-1bp)"
```

---

### Task 13: Rebuild `KeyboardTab` container + wire capture/picker

**Files:**
- Modify: `frontend/src/components/settings/tabs/layout/KeyboardTab.vue` (full rewrite)
- Modify: `frontend/src/components/settings/categories/DeviceSettings.vue:70` (drop the now-unused `:config`/`@update:config` if only used for keyboardType — see step)
- Test: `frontend/tests/unit/components/keyboard/KeyboardTab.spec.js`

**Interfaces:**
- Consumes: `useKeyboardStore` (Task 7), `useKeyCapture` (Task 9), `KeyBindingBoard` (Task 12), `ActionPicker` (Task 10).

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/components/keyboard/KeyboardTab.spec.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import KeyboardTab from "@/components/settings/tabs/layout/KeyboardTab.vue";
import KeyBindingBoard from "@/components/settings/tabs/layout/keyboard/KeyBindingBoard.vue";
import ActionPicker from "@/components/settings/tabs/layout/keyboard/ActionPicker.vue";
import { useKeyboardStore } from "@/stores/keyboard";
import axios from "axios";

vi.mock("axios");

describe("KeyboardTab", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    axios.get.mockResolvedValue({ data: { mappings: { KEY_1: "generic_prev" } } });
    axios.put.mockResolvedValue({ data: {} });
  });

  it("loads mappings and renders the board", async () => {
    const w = mount(KeyboardTab);
    await flushPromises();
    expect(w.findComponent(KeyBindingBoard).exists()).toBe(true);
    expect(w.text()).toContain("Previous"); // actionLabel(generic_prev)
  });

  it("opens the picker on edit and saves the selection", async () => {
    const store = useKeyboardStore();
    const w = mount(KeyboardTab);
    await flushPromises();
    // Trigger edit for KEY_1 via the board's emit
    w.findComponent(KeyBindingBoard).vm.$emit("edit", "KEY_1");
    await flushPromises();
    expect(w.findComponent(ActionPicker).exists()).toBe(true);
    w.findComponent(ActionPicker).vm.$emit("select", "generic_next");
    await flushPromises();
    expect(axios.put).toHaveBeenCalledWith("/api/keyboard/mappings/KEY_1", { action: "generic_next" });
    expect(store.mappings.KEY_1).toBe("generic_next");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run tests/unit/components/keyboard/KeyboardTab.spec.js`
Expected: FAIL (old KeyboardTab renders selects, not the board).

- [ ] **Step 3: Rewrite `KeyboardTab.vue`**

Replace `frontend/src/components/settings/tabs/layout/KeyboardTab.vue`:

```vue
<template>
  <div class="keyboard-tab">
    <CollapsibleSection title="Keyboard Buttons" icon="⌨️" :expanded="true">
      <p class="kb-intro">
        Press a button to bind it, then choose what it does. Buttons 1–7 are your remote; other
        keys work too for full keyboards.
      </p>

      <div v-if="store.loading" class="kb-msg">Loading mappings…</div>
      <div v-else-if="store.error" class="kb-msg kb-msg--err" role="alert">{{ store.error }}</div>

      <KeyBindingBoard
        v-else
        :mappings="store.mappings"
        :capturing="capturing"
        @edit="openPicker"
        @clear="clearKey"
        @add="captureNewKey"
      />
    </CollapsibleSection>

    <div v-if="pickerKey" class="kb-picker-overlay" @click.self="closePicker">
      <ActionPicker
        :key-code="pickerKey"
        :current-action="store.mappings[pickerKey] || null"
        @select="onSelect"
        @close="closePicker"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useKeyboardStore } from "@/stores/keyboard";
import { useKeyCapture } from "@/composables/useKeyCapture";
import { logError } from "@/utils/logger";
import CollapsibleSection from "../../shared/CollapsibleSection.vue";
import KeyBindingBoard from "./keyboard/KeyBindingBoard.vue";
import ActionPicker from "./keyboard/ActionPicker.vue";

const store = useKeyboardStore();
const { capturing, capture } = useKeyCapture();

const pickerKey = ref(null);

onMounted(() => {
  store.fetchMappings().catch(err => logError("[Keyboard]", "load failed:", err));
});

const openPicker = key => {
  pickerKey.value = key;
};
const closePicker = () => {
  pickerKey.value = null;
};

const onSelect = async action => {
  const key = pickerKey.value;
  closePicker();
  try {
    await store.setMapping(key, action);
  } catch (err) {
    logError("[Keyboard]", "save failed:", err);
  }
};

const clearKey = async key => {
  try {
    await store.removeMapping(key);
  } catch (err) {
    logError("[Keyboard]", "clear failed:", err);
  }
};

const captureNewKey = async () => {
  const key = await capture();
  if (key) openPicker(key);
};
</script>

<style scoped>
.keyboard-tab { width: 100%; }
.kb-intro { color: var(--ink-2); font-size: 0.85rem; margin: 0 0 12px; }
.kb-msg { padding: 12px; border-radius: 6px; background: var(--bg-2); color: var(--ink-2); }
.kb-msg--err {
  background: color-mix(in srgb, var(--err) 12%, var(--bg-1));
  color: var(--err);
  border: 1px solid var(--err);
}
.kb-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, var(--bg-1) 60%, transparent);
}
</style>
```

- [ ] **Step 4: Simplify the `DeviceSettings` mount**

In `frontend/src/components/settings/categories/DeviceSettings.vue`, the tab no longer needs config. Change line ~70 from:

```vue
<KeyboardTab :config="config" @update:config="patch => emit('update:config', patch)" />
```

to:

```vue
<KeyboardTab />
```

First confirm nothing else in that file relied on the keyboard config: run `grep -n "keyboardType" frontend/src/components/settings/categories/DeviceSettings.vue` — expect no output. Leave the `KeyboardTab` import (line ~161) as-is.

- [ ] **Step 5: Run the tab test + full keyboard component suite**

Run: `cd frontend && npx vitest run tests/unit/components/keyboard/ tests/unit/stores/keyboard.spec.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/settings/tabs/layout/KeyboardTab.vue frontend/src/components/settings/categories/DeviceSettings.vue frontend/tests/unit/components/keyboard/KeyboardTab.spec.js
git commit -m "feat(keyboard): rebuild KeyboardTab as device board + capture + picker (calvin-1bp)"
```

---

## Phase D — Cleanup & full verification

### Task 14: Remove frontend `keyboardType` remnants + full gate

**Files:**
- Modify: any frontend file still referencing `keyboardType` (config defaults/forms) — discovered via grep.
- Test: full suites.

- [ ] **Step 1: Find remaining references**

Run: `cd frontend && grep -rn "keyboardType\|keyboard_type\|setKeyboardType" src --include=*.vue --include=*.js | grep -v node_modules`
Expected: a short list (e.g. a default in a config object, or a form binding). If none, skip to Step 3.

- [ ] **Step 2: Remove each reference**

For each hit: delete the `keyboardType` default/field/binding. Do **not** touch `useKeyboardActions.js` (it has no `keyboardType`; if a grep hit appears there, stop — it should not). Re-run the grep until it returns nothing (outside `node_modules`).

- [ ] **Step 3: Frontend full gate**

Run: `cd frontend && npx vitest run && npx eslint src && npx prettier --check "src/**/*.{vue,js}"`
Expected: all tests PASS, eslint 0 errors, prettier clean. If prettier flags files, run `npx prettier --write` on them and amend.

- [ ] **Step 4: Backend full gate**

Run: `cd backend && uv run pytest -q && uv run ruff check . && uv run mypy app`
Expected: PASS / no errors.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Start the app, open Settings → Device → Keyboard Buttons. Verify: board shows 7 tiles with the default actions; clicking ✎ opens the picker with Generic on top; selecting an action persists after reload; pressing "＋ Press a button" then a key opens the picker for that key; Escape cancels; the physical/emulated 1–7 still navigate the dashboard.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(keyboard): remove keyboardType remnants; full-suite green (calvin-1bp)"
```

---

## Self-Review Notes (coverage against spec)

- **Unify data model** → Tasks 1–4 (service, migration, API, seed/config). ✓
- **Shared normalizer** → Task 5; consumed in Task 8. ✓
- **Generic-first grouped picker, Modes dropped** → Task 6 catalog + Task 10 ActionPicker. ✓
- **Press-to-capture** → Task 7 store primitives + Task 8 handler intercept + Task 9 composable + Task 13 wiring. ✓
- **Device board (B) + Other keys + conflict indicator** → Tasks 11–12. ✓
- **Rebuilt container + mount** → Task 13. ✓
- **Default map preserved** → Task 4 `DEFAULT_KEYBOARD_MAPPINGS`. ✓
- **`useKeyboardActions.js` untouched** → asserted in Task 14 Step 2; no task modifies it. ✓
- **calvin-py5 (retire mode_* )** → out of scope; catalog keeps them reachable under Jump/Legacy. ✓
