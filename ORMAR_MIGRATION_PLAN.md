# Complete Ormar Migration Guide

**Consolidated from:** ORM_RESEARCH.md, ORMAR_MIGRATION_ASSESSMENT.md, ORMAR_MIGRATION_CURRENT_STATE.md, ORMAR_MIGRATIONS_GUIDE.md, ORMAR_FRESH_DB_OPTIMIZATIONS.md, ORMAR_MIGRATION_PLAN.md

## Table of Contents

### Overview & Planning
1. [Executive Summary](#executive-summary)
2. [Part 1: Why Ormar? (Research & Decision)](#part-1-why-ormar-research--decision)
3. [Prerequisites](#prerequisites)

### Detailed Migration Steps
4. [Phase 1: Setup & Dependencies](#phase-1-setup--dependencies)
5. [Phase 2: Database Configuration](#phase-2-database-configuration)
6. [Phase 3: Model Conversion](#phase-3-model-conversion)
7. [Phase 4: Service Layer Migration](#phase-4-service-layer-migration)
8. [Phase 5: API Routes Migration](#phase-5-api-routes-migration)
9. [Phase 6: Test Updates](#phase-6-test-updates)
10. [Phase 7: Cleanup](#phase-7-cleanup)

### Reference Guides
11. [Part 6: Complete Alembic Migrations Guide](#part-6-complete-alembic-migrations-guide)
12. [Part 7: Fresh Database Optimizations](#part-7-fresh-database-optimizations)
13. [Quick Reference: Query Patterns](#quick-reference-query-patterns)

### Testing & Troubleshooting
14. [Testing Checklist](#testing-checklist)
15. [Rollback Plan](#rollback-plan)
16. [Common Issues & Solutions](#common-issues--solutions)
17. [Migration Order Summary](#migration-order-summary)

---

## Executive Summary

**Estimated Effort: Medium (2-3 weeks for full migration)**

The migration from SQLAlchemy to Ormar is **feasible** and will result in **cleaner, more maintainable code**. The effort is moderate because:

- ✅ **Simple models**: Only 4 models with no complex relationships
- ✅ **Straightforward queries**: Mostly simple SELECT/INSERT/UPDATE/DELETE
- ✅ **No complex joins**: No relationship queries to migrate
- ⚠️ **Widespread usage**: ~30+ files use database models
- ⚠️ **Custom type handling**: JSONEncodedDict needs conversion
- ⚠️ **Raw SQL usage**: Some raw SQL in migrations/fallbacks needs attention

**Why Ormar?**
- ✅ **True Pydantic-first**: Models ARE Pydantic models (not generated)
- ✅ **Fully async-native**: No sync/async confusion
- ✅ **Simpler than SQLAlchemy**: Less boilerplate, cleaner API
- ✅ **Can reuse Alembic**: Your existing migration setup can work
- ✅ **Well documented**: Good docs and examples
- ✅ **Active maintenance**: Actively maintained project

**Benefits After Migration:**
- ✅ **~30% less code**: No session management boilerplate
- ✅ **Better type safety**: Native Pydantic models
- ✅ **Cleaner queries**: `Model.objects.filter()` vs `select().where()`
- ✅ **No custom types**: Built-in JSON support

---

## Part 1: Why Ormar? (Research & Decision)

### Current Setup
- **ORM**: SQLAlchemy 2.0 with async support (AsyncSession, create_async_engine)
- **Framework**: FastAPI
- **Database**: SQLite (with aiosqlite)
- **Migrations**: Alembic
- **Python**: 3.12+

### Requirements Met by Ormar
1. ✅ More modern than SQLAlchemy
2. ✅ Native Pydantic support for models
3. ✅ Async-native (not just async-capable)
4. ✅ Well documented
5. ✅ Easy to use

### Why Not Other Options?

**SQLModel**: Created by FastAPI creator, but still uses SQLAlchemy under the hood - doesn't solve "tired of SQLAlchemy" issue.

**Tortoise ORM**: Pydantic integration is mainly for serialization (output), not full two-way mapping. Need to generate Pydantic models from Tortoise models.

**Piccolo**: Less popular, smaller community. Uses table definitions, then generates models.

**Prisma Client Python**: ❌ Archived in April 2025 - not recommended.

**Conclusion:** Ormar provides true Pydantic-first models with full async support, making it the best fit.

---

## Prerequisites

### Before Starting
- [ ] Create a new git branch: `git checkout -b migrate-to-ormar`
- [ ] Ensure all tests pass: `pytest`
- [ ] Backup your database: `cp backend/data/db/calvin.db backend/data/db/calvin.db.backup`
- [ ] Review current SQLAlchemy usage patterns

---

## Phase 1: Setup & Dependencies

### Step 1.1: Install Dependencies

**File:** `backend/pyproject.toml`

**Action:** Add Ormar and databases packages

```bash
cd backend
uv add ormar databases
```

**Verify:**
- [ ] `ormar` appears in `pyproject.toml`
- [ ] `databases` appears in `pyproject.toml`
- [ ] `aiosqlite` is already present (required by Ormar)

**Note:** Keep `sqlalchemy` - it's still needed for Alembic migrations.

### Step 1.2: Migration Support

**Good News:** ✅ Ormar fully supports migrations via **Alembic** (which you're already using!)

**How it works:**
- Ormar models use SQLAlchemy `MetaData` under the hood
- Alembic can read this metadata to generate migrations
- Your existing Alembic setup will work with minimal changes

**What changes:**
- In `alembic/env.py`, change `target_metadata = Base.metadata` to `target_metadata = metadata`
- Import models from Ormar instead of SQLAlchemy Base
- Everything else stays the same!

**Migration workflow remains the same:**
```bash
# Generate migration
alembic revision --autogenerate -m "description"

# Apply migration
alembic upgrade head
```

---

## Phase 2: Database Configuration

### Step 2.1: Update `app/database.py`

**File:** `backend/app/database.py`

**Current Code:**
```python
"""Database configuration and session management."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.config import settings

# ... logging setup ...

engine = create_async_engine(
    settings.database_url.replace("sqlite:///", "sqlite+aiosqlite:///"),
    echo=False,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db() -> AsyncSession:
    """Get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initialize database (create tables)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

**New Code:**
```python
"""Database configuration and session management."""

import logging

import databases
import ormar
from sqlalchemy import MetaData

from app.config import settings

# Ensure SQLAlchemy loggers are set to WARNING to reduce noise
# (Keep existing logging setup)
sqlalchemy_engine_logger = logging.getLogger("sqlalchemy.engine")
sqlalchemy_engine_logger.setLevel(logging.WARNING)
sqlalchemy_engine_logger.propagate = True

sqlalchemy_pool_logger = logging.getLogger("sqlalchemy.pool")
sqlalchemy_pool_logger.setLevel(logging.WARNING)
sqlalchemy_pool_logger.propagate = True

sqlalchemy_dialects_logger = logging.getLogger("sqlalchemy.dialects")
sqlalchemy_dialects_logger.setLevel(logging.WARNING)
sqlalchemy_dialects_logger.propagate = True

# Create database connection for Ormar
database = databases.Database(
    settings.database_url.replace("sqlite:///", "sqlite+aiosqlite:///")
)

# Create metadata for Ormar models
metadata = MetaData()


async def connect_db():
    """Connect to database."""
    await database.connect()


async def disconnect_db():
    """Disconnect from database."""
    await database.disconnect()


async def init_db():
    """Initialize database (create tables)."""
    # Connect if not already connected
    if not database.is_connected:
        await database.connect()
    
    # Create tables using metadata
    # Note: Ormar will create tables automatically when models are imported
    # But we can also use metadata.create_all for explicit control
    from sqlalchemy import create_engine
    
    # For table creation, we need a sync engine
    sync_url = settings.database_url.replace("sqlite+aiosqlite:///", "sqlite:///")
    sync_engine = create_engine(sync_url, echo=False)
    metadata.create_all(sync_engine)
    sync_engine.dispose()
```

**Changes:**
1. ✅ Replace `create_async_engine` with `databases.Database`
2. ✅ Replace `Base = declarative_base()` with `metadata = MetaData()`
3. ✅ Remove `AsyncSessionLocal` (not needed with Ormar)
4. ✅ Remove `get_db()` function (not needed - Ormar manages connections)
5. ✅ Update `init_db()` to use metadata

**Testing:**
- [ ] Import works: `from app.database import database, metadata`
- [ ] No syntax errors

---

## Phase 3: Model Conversion

**⚠️ Note:** If starting with a **fresh database**, consider the optimizations in `ORMAR_FRESH_DB_OPTIMIZATIONS.md`, especially removing theme database storage and using filesystem-only themes.

### Step 3.1: Convert `app/models/db_models.py`

**File:** `backend/app/models/db_models.py`

**Current Code:**
```python
"""Database models for calendar sources and configuration."""

import json
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.types import VARCHAR, TypeDecorator

from app.database import Base


class JSONEncodedDict(TypeDecorator):
    """JSON-encoded dictionary type for SQLAlchemy."""
    # ... implementation ...


class ConfigDB(Base):
    """Database model for application configuration."""
    __tablename__ = "config"
    key = Column(String, primary_key=True, index=True)
    value = Column(Text, nullable=True)
    value_type = Column(String, nullable=False, default="string")


class KeyboardMappingDB(Base):
    """Database model for keyboard mappings."""
    __tablename__ = "keyboard_mappings"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    keyboard_type = Column(String, nullable=False)
    key_code = Column(String, nullable=False)
    action = Column(String, nullable=False)
    __table_args__ = ({"sqlite_autoincrement": True},)


class PluginTypeDB(Base):
    """Database model for plugin types."""
    __tablename__ = "plugin_types"
    type_id = Column(String, primary_key=True, index=True)
    plugin_type = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    version = Column(String, nullable=True)
    common_config_schema = Column(JSONEncodedDict, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PluginDB(Base):
    """Database model for plugin instances."""
    __tablename__ = "plugins"
    id = Column(String, primary_key=True, index=True)
    type_id = Column(String, nullable=False, index=True)
    plugin_type = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    version = Column(String, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    config = Column(JSONEncodedDict, nullable=True)
    display_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
```

**New Code:**
```python
"""Database models for calendar sources and configuration."""

from datetime import datetime
from typing import Optional

import ormar

from app.database import database, metadata


class ConfigDB(ormar.Model):
    """Database model for application configuration."""

    class Meta:
        tablename = "config"
        database = database
        metadata = metadata

    key: str = ormar.String(max_length=255, primary_key=True, index=True)
    value: Optional[str] = ormar.Text(nullable=True)
    value_type: str = ormar.String(max_length=50, nullable=False, default="string")


class KeyboardMappingDB(ormar.Model):
    """Database model for keyboard mappings."""

    class Meta:
        tablename = "keyboard_mappings"
        database = database
        metadata = metadata

    id: Optional[int] = ormar.Integer(primary_key=True, autoincrement=True)
    keyboard_type: str = ormar.String(max_length=50, nullable=False)
    key_code: str = ormar.String(max_length=100, nullable=False)
    action: str = ormar.String(max_length=100, nullable=False)


class PluginTypeDB(ormar.Model):
    """Database model for plugin types."""

    class Meta:
        tablename = "plugin_types"
        database = database
        metadata = metadata

    type_id: str = ormar.String(max_length=255, primary_key=True, index=True)
    plugin_type: str = ormar.String(max_length=50, nullable=False)
    name: str = ormar.String(max_length=255, nullable=False)
    description: Optional[str] = ormar.Text(nullable=True)
    version: Optional[str] = ormar.String(max_length=50, nullable=True)
    common_config_schema: Optional[dict] = ormar.JSON(nullable=True)  # Built-in JSON!
    enabled: bool = ormar.Boolean(default=True, nullable=False)
    error_message: Optional[str] = ormar.Text(nullable=True)
    created_at: datetime = ormar.DateTime(default=datetime.utcnow, nullable=False)
    updated_at: datetime = ormar.DateTime(default=datetime.utcnow, nullable=False)


class PluginDB(ormar.Model):
    """Database model for plugin instances."""

    class Meta:
        tablename = "plugins"
        database = database
        metadata = metadata

    id: str = ormar.String(max_length=255, primary_key=True, index=True)
    type_id: str = ormar.String(max_length=255, nullable=False, index=True)
    plugin_type: str = ormar.String(max_length=50, nullable=False, index=True)
    name: str = ormar.String(max_length=255, nullable=False)
    version: Optional[str] = ormar.String(max_length=50, nullable=True)
    enabled: bool = ormar.Boolean(default=True, nullable=False)
    config: Optional[dict] = ormar.JSON(nullable=True)  # Built-in JSON!
    display_order: int = ormar.Integer(default=0, nullable=False)
    created_at: datetime = ormar.DateTime(default=datetime.utcnow, nullable=False)
    updated_at: datetime = ormar.DateTime(default=datetime.utcnow, nullable=False)
```

**Key Changes:**
1. ✅ Remove `JSONEncodedDict` class entirely (Ormar has built-in JSON)
2. ✅ Change `Base` to `ormar.Model`
3. ✅ Add `Meta` class with `tablename`, `database`, `metadata`
4. ✅ Replace `Column(...)` with `ormar.FieldType(...)`
5. ✅ Use `ormar.JSON()` instead of `JSONEncodedDict`
6. ✅ Add type hints to all fields
7. ✅ Remove `__table_args__` (not needed)

**Field Type Mappings:**
- `Column(String)` → `ormar.String(max_length=255)`
- `Column(Text)` → `ormar.Text()`
- `Column(Integer)` → `ormar.Integer()`
- `Column(Boolean)` → `ormar.Boolean()`
- `Column(DateTime)` → `ormar.DateTime()`
- `Column(JSONEncodedDict)` → `ormar.JSON()`

**Testing:**
- [ ] Models can be imported: `from app.models.db_models import ConfigDB`
- [ ] No syntax errors
- [ ] Type hints work correctly

---

## Phase 4: Service Layer Migration

### Step 4.1: Update `app/services/config_service.py`

**File:** `backend/app/services/config_service.py`

**Current Code:**
```python
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.db_models import ConfigDB

class ConfigService:
    async def get_config(self) -> dict[str, Any]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(ConfigDB))
            config_items = result.scalars().all()
            # ... process items ...
    
    async def get_value(self, key: str, default: Any = None) -> Any:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(ConfigDB).where(ConfigDB.key == key))
            item = result.scalar_one_or_none()
            # ... process item ...
    
    async def set_value(self, key: str, value: Any) -> None:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(ConfigDB).where(ConfigDB.key == key))
            item = result.scalar_one_or_none()
            if item:
                item.value = serialized_value
                item.value_type = value_type
            else:
                item = ConfigDB(key=key, value=serialized_value, value_type=value_type)
                session.add(item)
            await session.commit()
```

**New Code:**
```python
from app.models.db_models import ConfigDB

class ConfigService:
    async def get_config(self) -> dict[str, Any]:
        config_items = await ConfigDB.objects.all()
        config = {}
        for item in config_items:
            config[item.key] = self._parse_value(item.value, item.value_type)
        return config
    
    async def get_value(self, key: str, default: Any = None) -> Any:
        try:
            item = await ConfigDB.objects.get_or_none(key=key)
            if item:
                return self._parse_value(item.value, item.value_type)
            return default
        except Exception:
            return default
    
    async def set_value(self, key: str, value: Any, value_type: str | None = None) -> None:
        if value_type is None:
            value_type = self._detect_type(value)
        
        serialized_value = self._serialize_value(value, value_type)
        
        item = await ConfigDB.objects.get_or_none(key=key)
        if item:
            item.value = serialized_value
            item.value_type = value_type
            await item.update()
        else:
            await ConfigDB.objects.create(
                key=key,
                value=serialized_value,
                value_type=value_type
            )
        
        # Update cache
        self._cache[key] = value
```

**Key Changes:**
1. ✅ Remove `from sqlalchemy import select`
2. ✅ Remove `from app.database import AsyncSessionLocal`
3. ✅ Remove all `async with AsyncSessionLocal() as session:` blocks
4. ✅ Replace `session.execute(select(...))` with `Model.objects.get()`
5. ✅ Replace `result.scalar_one_or_none()` with `.get_or_none()`
6. ✅ Replace `result.scalars().all()` with `.all()`
7. ✅ Replace `session.add()` + `session.commit()` with `.create()` or `.update()`

**Query Pattern Mappings:**

| SQLAlchemy | Ormar |
|------------|-------|
| `select(Model)` | `Model.objects.all()` |
| `select(Model).where(Model.field == value)` | `Model.objects.filter(field=value).all()` |
| `select(Model).where(Model.field == value)` (single) | `Model.objects.get_or_none(field=value)` |
| `session.add(obj)` + `session.commit()` | `await Model.objects.create(...)` |
| `obj.field = value` + `session.commit()` | `obj.field = value` + `await obj.update()` |
| `session.delete(obj)` + `session.commit()` | `await obj.delete()` |

**Testing:**
- [ ] Service methods work correctly
- [ ] No import errors
- [ ] Database operations succeed

---

### Step 4.2: Update `app/services/keyboard_mapping_service.py`

**File:** `backend/app/services/keyboard_mapping_service.py`

**Find and Replace Patterns:**

1. **Remove imports:**
```python
# REMOVE:
from sqlalchemy import select, delete
from app.database import AsyncSessionLocal
```

2. **Update query patterns:**

**Before:**
```python
async with AsyncSessionLocal() as session:
    result = await session.execute(
        select(KeyboardMappingDB).where(KeyboardMappingDB.keyboard_type == keyboard_type)
    )
    mappings = result.scalars().all()
```

**After:**
```python
mappings = await KeyboardMappingDB.objects.filter(keyboard_type=keyboard_type).all()
```

**Before:**
```python
async with AsyncSessionLocal() as session:
    await session.execute(
        delete(KeyboardMappingDB).where(KeyboardMappingDB.keyboard_type == keyboard_type)
    )
    await session.commit()
```

**After:**
```python
mappings = await KeyboardMappingDB.objects.filter(keyboard_type=keyboard_type).all()
for mapping in mappings:
    await mapping.delete()
```

**Before:**
```python
async with AsyncSessionLocal() as session:
    mapping = KeyboardMappingDB(
        keyboard_type=keyboard_type,
        key_code=key_code,
        action=action
    )
    session.add(mapping)
    await session.commit()
```

**After:**
```python
await KeyboardMappingDB.objects.create(
    keyboard_type=keyboard_type,
    key_code=key_code,
    action=action
)
```

**Testing:**
- [ ] All methods work
- [ ] No errors

---

### Step 4.3: Update `app/plugins/registry/manager.py`

**File:** `backend/app/plugins/registry/manager.py`

**Key Changes:**

1. **Remove imports:**
```python
# REMOVE:
from sqlalchemy import select, text
from app.database import AsyncSessionLocal
```

2. **Update query patterns:**

**Before:**
```python
result = await session.execute(select(PluginTypeDB).where(PluginTypeDB.type_id == type_id))
db_type = result.scalar_one_or_none()
```

**After:**
```python
db_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)
```

**Before:**
```python
db_plugin = PluginDB(...)
session.add(db_plugin)
await session.commit()
```

**After:**
```python
db_plugin = await PluginDB.objects.create(...)
```

**Before:**
```python
await session.delete(db_plugin)
await session.commit()
```

**After:**
```python
await db_plugin.delete()
```

**Before:**
```python
# Raw SQL fallback
sql_result = await verify_session.execute(
    text("DELETE FROM plugins WHERE id = :plugin_id"),
    {"plugin_id": plugin_id},
)
```

**After:**
```python
# Use Ormar instead
plugin = await PluginDB.objects.get_or_none(id=plugin_id)
if plugin:
    await plugin.delete()
```

**Testing:**
- [ ] Plugin registration works
- [ ] Plugin deletion works
- [ ] No raw SQL needed

### Important Patterns Found in Codebase

#### Pattern 1: Session Refresh (Not Needed with Ormar)

**Location:** Multiple files after updates

**Current Code:**
```python
await session.commit()
await session.refresh(db_plugin)
```

**Ormar Equivalent:**
```python
await db_plugin.update()
# Object is automatically fresh after update - no refresh needed!
```

⚠️ **Important:** Ormar objects are automatically fresh after `update()` or `save()`. No `refresh()` call needed.

**Files affected:**
- `backend/app/api/routes/plugins/instances.py` (line 296)
- `backend/app/api/routes/calendar.py` (line 387)
- `backend/app/plugins/registry/manager.py` (line 112)
- Multiple test files

#### Pattern 2: Session Parameter in Functions (Remove with Ormar)

**Location:** `main.py`

**Current Code:**
```python
async def _create_default_plugin_instance(
    plugin_registry, session, type_id: str, plugin_id: str, name: str, config: dict
):
    # Uses session parameter
    result = await session.execute(select(PluginTypeDB)...)
```

**Ormar Solution:**
```python
async def _create_default_plugin_instance(
    plugin_registry, type_id: str, plugin_id: str, name: str, config: dict
):
    # No session parameter needed!
    plugin_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)
```

**File affected:**
- `backend/app/main.py` (line 149-181)

**Changes needed:**
1. Remove `session` parameter
2. Update call site in `_initialize_plugins()` (line 193-206)

#### Pattern 3: Config Dictionary Updates

**Location:** `instances.py`

**Current Code:**
```python
# Create a new dict to ensure SQLAlchemy detects the change
# (JSONEncodedDict doesn't detect in-place modifications)
existing_config = dict(db_plugin.config or {})
existing_config.update(config)
db_plugin.config = existing_config
await session.commit()
```

**Ormar Solution:**
```python
# Ormar JSON fields detect changes automatically
existing_config = dict(db_plugin.config or {})
existing_config.update(config)
db_plugin.config = existing_config
await db_plugin.update()
```

**File affected:**
- `backend/app/api/routes/plugins/instances.py` (lines 284-288)

**Note:** The comment about `JSONEncodedDict` not detecting changes can be removed - Ormar handles this automatically.

#### Pattern 4: Nested Session Verification (Simplify with Ormar)

**Location:** `manager.py`

**Current Code:**
```python
async with AsyncSessionLocal() as session:
    # ... do work ...
    async with AsyncSessionLocal() as verify_session:
        # Verify in separate session
```

**Ormar Solution:**
```python
# No need for separate sessions - just query again!
plugin = await PluginDB.objects.get_or_none(id=plugin_id)
if not plugin:
    # Deleted successfully
```

**File affected:**
- `backend/app/plugins/registry/manager.py` (lines 162-203)

**Note:** This simplifies the verification logic significantly.

---

## Phase 5: API Routes Migration

### Step 5.1: Update `app/api/routes/plugins/instances.py`

**File:** `backend/app/api/routes/plugins/instances.py`

**Changes:**

1. **Remove imports:**
```python
# REMOVE:
from sqlalchemy import asc, select
from app.database import AsyncSessionLocal
```

2. **Update query patterns:**

**Before:**
```python
async with AsyncSessionLocal() as session:
    result = await session.execute(select(PluginDB).where(PluginDB.id == instance_id))
    db_plugin = result.scalar_one_or_none()
```

**After:**
```python
db_plugin = await PluginDB.objects.get_or_none(id=instance_id)
```

**Before:**
```python
result = await session.execute(
    select(PluginDB)
    .where(PluginDB.plugin_type == "image")
    .order_by(asc(PluginDB.display_order), asc(PluginDB.name))
)
plugins = result.scalars().all()
```

**After:**
```python
plugins = await PluginDB.objects.filter(
    plugin_type="image"
).order_by("display_order", "name").all()
```

**Before:**
```python
db_plugin.display_order = new_order
await session.commit()
```

**After:**
```python
db_plugin.display_order = new_order
await db_plugin.update()
```

**Testing:**
- [ ] All endpoints work
- [ ] No errors

---

### Step 5.2: Update `app/api/routes/plugins/management.py`

**File:** `backend/app/api/routes/plugins/management.py`

**Similar patterns as Step 5.1**

**Key patterns to replace:**
- `select(PluginTypeDB)` → `PluginTypeDB.objects.all()`
- `select(PluginDB).where(...)` → `PluginDB.objects.filter(...).all()`
- `session.add()` + `session.commit()` → `await Model.objects.create()`
- `obj.field = value` + `session.commit()` → `obj.field = value` + `await obj.update()`

---

### Step 5.3: Update `app/main.py`

**File:** `backend/app/main.py`

**Changes:**

1. **Update imports:**
```python
# REMOVE:
from sqlalchemy import select
from app.database import AsyncSessionLocal
```

2. **Update query patterns:**

**Before:**
```python
async with AsyncSessionLocal() as session:
    result = await session.execute(select(PluginTypeDB).where(PluginTypeDB.type_id == type_id))
    plugin_type = result.scalar_one_or_none()
```

**After:**
```python
plugin_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)
```

3. **Update database initialization:**

**Before:**
```python
from app.database import engine
```

**After:**
```python
from app.database import database, connect_db, disconnect_db
```

**Update lifespan:**

**Before:**
```python
async def lifespan(app: FastAPI):
    # Startup
    await _initialize_database()
    # ...
    yield
    # Shutdown
```

**After:**
```python
async def lifespan(app: FastAPI):
    # Startup
    await connect_db()
    await _initialize_database()
    # ...
    yield
    # Shutdown
    await disconnect_db()
```

---

## Phase 6: Test Updates

### Step 6.1: Update `backend/tests/conftest.py`

**File:** `backend/tests/conftest.py`

**Changes:**

1. **Update imports:**
```python
# REMOVE:
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ADD:
from app.database import database, metadata, connect_db, disconnect_db
```

2. **Update fixtures:**

**Before:**
```python
@pytest.fixture
async def db_session():
    async with AsyncSessionLocal() as session:
        yield session
```

**After:**
```python
@pytest.fixture
async def db_session():
    await connect_db()
    yield
    await disconnect_db()
```

3. **Update test database setup:**

**Before:**
```python
engine = create_async_engine("sqlite+aiosqlite:///:memory:")
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession)
```

**After:**
```python
# Use in-memory database
test_database = databases.Database("sqlite+aiosqlite:///:memory:")
await test_database.connect()
# Update models to use test_database
```

**Note:** For tests, you may need to create a separate test database instance.

---

### Step 6.2: Update Individual Test Files

**Files to update:**
- `backend/tests/unit/test_*.py`
- `backend/tests/integration/test_*.py`

**Pattern to replace in all tests:**

**Before:**
```python
async with AsyncSessionLocal() as session:
    result = await session.execute(select(Model).where(...))
    obj = result.scalar_one_or_none()
```

**After:**
```python
obj = await Model.objects.get_or_none(...)
```

**Before:**
```python
db_obj = Model(...)
session.add(db_obj)
await session.commit()
```

**After:**
```python
db_obj = await Model.objects.create(...)
```

---

## Phase 7: Cleanup

### Step 7.1: Update Alembic Configuration (or Create Fresh Migration)

**⚠️ Fresh Database Option:** If starting with a fresh database, you can skip old migrations and create one clean initial migration. See `ORMAR_FRESH_DB_OPTIMIZATIONS.md` for details.

**File:** `backend/alembic/env.py`

**Option A: Update existing env.py (if keeping old migrations)**

**Current Code:**
```python
from app.database import Base
from app.models.db_models import (
    ConfigDB,
    KeyboardMappingDB,
    PluginDB,
    PluginTypeDB,
)

target_metadata = Base.metadata
```

**New Code:**
```python
from app.database import metadata
from app.models.db_models import (  # noqa: F401
    ConfigDB,
    KeyboardMappingDB,
    PluginDB,
    PluginTypeDB,
)

# Ormar models register themselves in metadata when imported
target_metadata = metadata
```

**Changes:**
1. ✅ Replace `from app.database import Base` with `from app.database import metadata`
2. ✅ Replace `target_metadata = Base.metadata` with `target_metadata = metadata`
3. ✅ Keep model imports (they register themselves in metadata)

**Testing:**
- [ ] Run `alembic revision --autogenerate -m "test"` - should work
- [ ] Check generated migration looks correct
- [ ] Run `alembic upgrade head` - should apply successfully

**Note:** Alembic will continue to work exactly as before. The only change is pointing it to Ormar's metadata instead of SQLAlchemy's Base.metadata.

**Option B: Create fresh initial migration (recommended for fresh database)**

If starting fresh, you can:

1. **Archive old migrations:**
   ```bash
   mv backend/alembic/versions backend/alembic/versions_old
   mkdir backend/alembic/versions
   ```

2. **Create new initial migration:**
   ```bash
   cd backend
   alembic revision --autogenerate -m "Initial Ormar schema"
   ```

3. **Review generated migration** - should create all tables at once

4. **Benefits:**
   - Clean migration history
   - No data migrations (themes loaded from filesystem)
   - Simpler to understand

**For theme optimization (if removing theme DB storage):**
- Skip theme registration migrations
- Themes will be loaded from filesystem only
- See `ORMAR_FRESH_DB_OPTIMIZATIONS.md` section 1 for details

---

### Step 7.2: Remove Unused Imports

**Search for and remove:**
- `from sqlalchemy import select, delete, ...`
- `from sqlalchemy.ext.asyncio import AsyncSession, ...`
- `from app.database import AsyncSessionLocal, Base, engine`

**Files to check:**
- All service files
- All API route files
- All test files

### Step 7.3: Remove Theme Database Sync (if using filesystem-only themes)

**⚠️ Optional Optimization:** If implementing filesystem-only themes (see `ORMAR_FRESH_DB_OPTIMIZATIONS.md`):

**File:** `backend/app/main.py`

**Remove:**
```python
# Remove this from lifespan:
await _sync_themes_to_db()  # ❌ No longer needed
```

**File:** `backend/app/api/routes/plugins/management.py`

**Update `get_plugins()` function** to load themes from filesystem instead of database:

**Before (query DB):**
```python
if include_themes or plugin_type is None:
    # Query themes from database
    theme_db_types = {
        tid: db_type
        for tid, db_type in db_types.items()
        if db_type.plugin_type == PluginType.THEME.value
    }
    # Then load manifests from filesystem anyway...
```

**After (load from filesystem):**
```python
if include_themes or plugin_type is None:
    # Load built-in themes
    for theme_id, theme_data in BUILTIN_THEMES.items():
        theme_entry = build_theme_entry(theme_data, is_builtin=True)
        result.append(theme_entry)
    
    # Load installed theme plugins
    installed_themes = theme_installer.get_installed_themes()
    for theme_manifest in installed_themes:
        theme_entry = build_theme_entry(theme_manifest, is_builtin=False)
        result.append(theme_entry)
```

**Benefits:**
- No database query needed
- No sync on startup
- Simpler code

---

### Step 7.4: Update `app/utils/db_init.py`

**File:** `backend/app/utils/db_init.py`

**Changes:**

1. **Update imports:**
```python
# REMOVE:
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from app.database import Base

# ADD:
from app.database import database, metadata, connect_db
```

2. **Update initialization:**

**Before:**
```python
if engine is None:
    db_url = f"sqlite+aiosqlite:///{database_path.resolve()}"
    engine = create_async_engine(db_url, echo=False, future=True)
```

**After:**
```python
# Connect to database if not connected
if not database.is_connected:
    await connect_db()
```

3. **Update table creation:**

**Before:**
```python
from app.models.db_models import ConfigDB, KeyboardMappingDB, PluginDB, PluginTypeDB
# Models registered in Base.metadata
```

**After:**
```python
from app.models.db_models import ConfigDB, KeyboardMappingDB, PluginDB, PluginTypeDB
# Models registered in metadata automatically
```

**Note:** Ormar models register themselves in metadata when imported.

---

## Part 6: Complete Alembic Migrations Guide

### Overview

**Yes, Ormar fully supports migrations!** ✅

Ormar uses **Alembic** (the same migration tool you're already using) for database schema migrations. Since Ormar models use SQLAlchemy `MetaData` under the hood, Alembic can read and generate migrations from your Ormar models.

### How It Works

```
Ormar Models → SQLAlchemy MetaData → Alembic → Database Migrations
```

1. **Ormar Models**: Define your schema using Ormar model classes
2. **SQLAlchemy MetaData**: Ormar automatically registers models in a `MetaData` object
3. **Alembic**: Reads the metadata and compares it to your database
4. **Migrations**: Generates SQL scripts to update your database schema

### Migration Workflow

#### 1. Make Changes to Models

Edit your Ormar models in `app/models/db_models.py`:

```python
class PluginDB(ormar.Model):
    # ... existing fields ...
    # Add new field:
    description: Optional[str] = ormar.Text(nullable=True)  # NEW!
```

#### 2. Generate Migration

```bash
cd backend
alembic revision --autogenerate -m "Add description field to PluginDB"
```

This will:
- Compare your Ormar models (via metadata) to the current database schema
- Generate a migration script in `alembic/versions/`
- Detect new fields, removed fields, type changes, etc.

#### 3. Review Generated Migration

**Always review the generated migration!** Especially for:
- Destructive operations (dropping columns, tables)
- Data type changes
- Index changes
- Foreign key changes

**Example generated migration:**
```python
"""Add description field to PluginDB

Revision ID: abc123
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.add_column('plugins', sa.Column('description', sa.Text(), nullable=True))

def downgrade():
    op.drop_column('plugins', 'description')
```

#### 4. Apply Migration

```bash
alembic upgrade head
```

This applies all pending migrations to your database.

#### 5. Rollback (if needed)

```bash
alembic downgrade -1  # Rollback one migration
alembic downgrade <revision_id>  # Rollback to specific revision
```

### Common Migration Scenarios

**Adding a New Field:**
```python
# Model Change:
new_field: Optional[str] = ormar.String(max_length=100, nullable=True)

# Generated Migration:
def upgrade():
    op.add_column('plugins', sa.Column('new_field', sa.String(100), nullable=True))
```

**Removing a Field:**
```python
# Model Change:
# old_field removed

# Generated Migration:
def upgrade():
    op.drop_column('plugins', 'old_field')
```

⚠️ **Warning:** This will delete data! Make sure you want to drop this column.

**Changing Field Type:**
```python
# SQLite doesn't support ALTER COLUMN well, so Alembic uses batch operations
with op.batch_alter_table('plugins') as batch_op:
    batch_op.alter_column('count', type_=sa.String(50))
```

⚠️ **Note:** Type changes may require data migration. Review carefully!

**Adding an Index:**
```python
# Model Change:
name: str = ormar.String(max_length=255, nullable=False, index=True)  # Add index=True

# Generated Migration:
def upgrade():
    op.create_index('ix_plugins_name', 'plugins', ['name'])
```

**Renaming a Field:**

⚠️ **Important:** Alembic doesn't automatically detect renames. You need to do this manually:

```python
def upgrade():
    op.rename_column('plugins', 'old_name', 'new_name')

def downgrade():
    op.rename_column('plugins', 'new_name', 'old_name')
```

### SQLite-Specific Considerations

SQLite has limitations that affect migrations:

1. **Limited ALTER TABLE Support**: SQLite doesn't support renaming columns or changing column types directly. **Solution:** Alembic uses "batch operations" for SQLite.

2. **Schema Changes Require Table Recreation**: For complex changes, Alembic may need to:
   - Create a new table with the new schema
   - Copy data from old table
   - Drop old table
   - Rename new table

This is handled automatically by Alembic's batch operations.

### Best Practices

1. **Always Review Generated Migrations** before applying
2. **Test Migrations in Development First** - test both upgrade and downgrade
3. **Backup Before Production Migrations**
4. **Use Descriptive Migration Messages**
5. **Don't Edit Existing Migrations** - create new ones instead
6. **Version Control Migrations** - always commit migration files

### Troubleshooting

**Issue: "Target database is not up to date"**
```bash
alembic upgrade head
```

**Issue: "Can't locate revision identified by 'xxxx'"**
```bash
alembic current  # See current revision
alembic history  # See available revisions
alembic upgrade head  # Upgrade to latest
```

**Issue: "Table already exists"**
This happens if tables were created manually. Either:
1. Mark the initial migration as already applied: `alembic stamp head`
2. Or drop tables and run migrations: `alembic upgrade head`

**Issue: Autogenerate Not Detecting Changes**
Possible causes:
1. Models not imported in `alembic/env.py`
2. Metadata not set correctly
3. Changes are too subtle (e.g., renaming)

**Solution:** Make sure all models are imported in `alembic/env.py`:
```python
from app.models.db_models import (
    ConfigDB,      # ✅ Imported
    KeyboardMappingDB,  # ✅ Imported
    PluginDB,      # ✅ Imported
    PluginTypeDB,  # ✅ Imported
)
```

---

## Testing Checklist

### Unit Tests
- [ ] `test_config_service.py` - All tests pass
- [ ] `test_keyboard_mapping_service.py` - All tests pass
- [ ] `test_plugin_registry.py` - All tests pass
- [ ] `test_db_init.py` - All tests pass

### Integration Tests
- [ ] `test_api_plugins.py` - All tests pass
- [ ] `test_api_instances.py` - All tests pass
- [ ] `test_api_config.py` - All tests pass
- [ ] `test_api_calendar.py` - All tests pass

### Manual Testing
- [ ] Start application: `uvicorn app.main:app`
- [ ] Create plugin instance via API
- [ ] Update plugin instance via API
- [ ] Delete plugin instance via API
- [ ] Update config via API
- [ ] Verify database persists correctly
- [ ] Check logs for errors

### Database Verification
- [ ] Tables exist: `sqlite3 backend/data/db/calvin.db ".tables"`
- [ ] Data integrity: Check a few records manually
- [ ] Migrations still work: `alembic upgrade head`

---

## Rollback Plan

### If Migration Fails

1. **Revert code:**
```bash
git checkout main
git branch -D migrate-to-ormar
```

2. **Restore database:**
```bash
cp backend/data/db/calvin.db.backup backend/data/db/calvin.db
```

3. **Remove dependencies:**
```bash
cd backend
uv remove ormar databases
```

### Partial Rollback

If only some parts fail, you can keep Ormar but revert specific files:

```bash
git checkout main -- path/to/file.py
```

---

## Common Issues & Solutions

### Issue 1: "database is not connected"

**Error:**
```
RuntimeError: database is not connected
```

**Solution:**
```python
from app.database import database, connect_db

# In startup/lifespan
await connect_db()
```

### Issue 2: "Model not found in metadata"

**Error:**
```
Model 'ConfigDB' not found in metadata
```

**Solution:**
Ensure models are imported before using metadata:
```python
from app.models.db_models import ConfigDB  # Import first
# Then use metadata
```

### Issue 3: "TypeError: 'NoneType' object is not callable"

**Error:**
```
TypeError: 'NoneType' object is not callable
```

**Solution:**
Check that `database` and `metadata` are properly initialized in `app/database.py`.

### Issue 4: Alembic migrations fail

**Error:**
```
Alembic can't find models
```

**Solution:**
Ensure you've updated `alembic/env.py` to use Ormar's metadata:
```python
# In alembic/env.py
from app.database import metadata
from app.models.db_models import ConfigDB, KeyboardMappingDB, PluginDB, PluginTypeDB

target_metadata = metadata
```

**Important:** Make sure all models are imported so they register themselves in metadata. The `# noqa: F401` comment prevents linter warnings about unused imports.

### Issue 5: JSON field returns string instead of dict

**Error:**
```
TypeError: string indices must be integers
```

**Solution:**
Ormar's `ormar.JSON()` automatically handles JSON serialization/deserialization. If you see strings, check that you're using `ormar.JSON()` not `ormar.Text()`.

### Issue 6: DateTime fields not updating automatically

**Error:**
```
updated_at field not updating
```

**Solution:**
Ormar doesn't have `onupdate` like SQLAlchemy. You need to manually update:
```python
plugin.updated_at = datetime.utcnow()
await plugin.update()
```

Or create a helper method:
```python
async def save_with_timestamp(self):
    self.updated_at = datetime.utcnow()
    await self.update()
```

---

## Migration Order Summary

1. ✅ **Phase 1**: Install dependencies
2. ✅ **Phase 2**: Update `database.py`
3. ✅ **Phase 3**: Convert models (`db_models.py`)
4. ✅ **Phase 4**: Convert services (one at a time)
5. ✅ **Phase 5**: Convert API routes (one at a time)
6. ✅ **Phase 6**: Update tests
7. ✅ **Phase 7**: Cleanup unused code

**Recommended approach:** Do one service/route at a time, test thoroughly, then move to the next.

---

## Quick Reference: Query Patterns

| Operation | SQLAlchemy | Ormar |
|-----------|-----------|-------|
| Get all | `select(Model)` | `Model.objects.all()` |
| Get one | `select(Model).where(...)` | `Model.objects.get(...)` |
| Get or None | `select(Model).where(...)` | `Model.objects.get_or_none(...)` |
| Filter | `select(Model).where(...)` | `Model.objects.filter(...).all()` |
| Create | `session.add(obj)` + `commit()` | `await Model.objects.create(...)` |
| Update | `obj.field = val` + `commit()` | `obj.field = val` + `await obj.update()` |
| Delete | `session.delete(obj)` + `commit()` | `await obj.delete()` |
| Order by | `.order_by(Model.field)` | `.order_by("field")` |
| Limit | `.limit(n)` | `.limit(n)` |
| Count | `select(func.count(...))` | `await Model.objects.count()` |

---

## Part 7: Fresh Database Optimizations

If starting with a **fresh database**, consider these optimizations to simplify the schema and reduce complexity.

### 1. ✅ Remove Theme Database Storage (High Priority)

#### Current Problem
- **Themes are synced to database** at runtime via `sync_themes_to_db()` (called on startup)
- **Migrations register themes** in database (2 migrations: `747053ae503f`, `2e2f87ec8be2`)
- **Redundant storage** - themes are static files, but also stored in DB

#### Solution: Load Themes from Filesystem On-Demand

**Current System:**
- **Built-in themes**: Stored in `backend/data/themes/builtin.json` (loaded at module level)
- **Theme plugins**: Installed via `theme_installer` → stored in `backend/data/themes/{theme-id}/theme.json`
- **Both are synced to database** for querying (via `PluginTypeDB` table)

**Problem:** Database only stores metadata, but actual manifests are **always** loaded from filesystem anyway!

**Better (load from filesystem only):**

```python
# Current (query DB, then load manifest from filesystem):
async def get_themes():
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PluginTypeDB).where(PluginTypeDB.plugin_type == "theme")
        )
        db_themes = result.scalars().all()
    
    themes = []
    for db_theme in db_themes:
        if db_theme.type_id in BUILTIN_THEMES:
            manifest = BUILTIN_THEMES.get(db_theme.type_id)  # From filesystem
        else:
            manifest = theme_installer.get_theme_manifest(db_theme.type_id)  # From filesystem
        themes.append(manifest)
    return themes

# Better (skip DB entirely):
async def get_themes():
    themes = []
    # Load built-in themes (already loaded from JSON at module level)
    themes.extend(BUILTIN_THEMES.values())
    
    # Load installed theme plugins (scans filesystem)
    installed = theme_installer.get_installed_themes()
    themes.extend(installed)
    
    return themes
```

**Key Insight:**
- Database only stores metadata (name, description, version, enabled)
- Actual theme manifests are **always** loaded from filesystem
- Themes are always `enabled=True` (hardcoded)
- No unique data is lost - everything comes from filesystem anyway!

#### Benefits
- ✅ **No migrations needed** for theme registration
- ✅ **No runtime sync** required (`sync_themes_to_db()` can be removed)
- ✅ **Single source of truth** - filesystem only
- ✅ **Faster startup** - no database writes on every startup
- ✅ **Simpler code** - no need to keep DB and filesystem in sync

#### Theme Plugin Handling

**Current theme plugin flow:**
1. User installs theme → `theme_installer.install_theme()` → Writes to filesystem
2. On startup → `sync_themes_to_db()` → Registers in database
3. On query → Query DB for theme list → Load manifests from filesystem

**Optimized flow:**
1. User installs theme → `theme_installer.install_theme()` → Writes to filesystem ✅ (same)
2. On startup → No sync needed ✅
3. On query → Scan filesystem for built-in + installed themes → Return manifests ✅

**No functionality lost:**
- Theme plugins are still installed/uninstalled via filesystem
- Theme manifests are still loaded from filesystem
- Only difference: No database registration step

#### Migration Impact
- **Can skip these migrations:**
  - `747053ae503f_ensure_built_in_themes_are_registered.py`
  - `2e2f87ec8be2_re_register_built_in_themes_if_missing.py`

### 2. ✅ Simplify Schema: Better Field Types

#### Issue 1: DateTime Defaults
**Current:**
```python
created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
```

**Problem:** `onupdate` doesn't work automatically in SQLAlchemy - need manual updates

**Better with Ormar:**
```python
created_at: datetime = ormar.DateTime(default=datetime.utcnow, nullable=False)
updated_at: datetime = ormar.DateTime(default=datetime.utcnow, nullable=False)
# Handle updated_at manually or use a model method
```

**OR:** Use a model method:
```python
async def save_with_timestamp(self):
    self.updated_at = datetime.utcnow()
    await self.update()
```

#### Issue 2: JSON Storage
**Current:** `JSONEncodedDict` custom type (complicated)
**Better with Ormar:** `ormar.JSON()` - native JSON support, automatic serialization/deserialization

#### Issue 3: String Lengths
**Current:**
```python
key = Column(String, primary_key=True, index=True)  # No max_length
```

**Better:**
```python
key: str = ormar.String(max_length=255, primary_key=True, index=True)
```

**Benefits:**
- Better database constraints
- More predictable performance
- Clearer schema definition

### 3. ✅ Optimize Indexes

**Current Indexes:**
- `ix_config_key` on `config.key` ✅
- `ix_plugin_types_type_id` on `plugin_types.type_id` ✅
- `ix_plugins_id` on `plugins.id` ✅
- `ix_plugins_type_id` on `plugins.type_id` ✅
- `ix_plugins_plugin_type` on `plugins.plugin_type` ✅

**Potential Optimizations:**

1. **Composite Indexes** for common queries:
```python
# If you often query by type_id AND plugin_type:
ormar.Index("ix_plugins_type_plugin_type", ["type_id", "plugin_type"])
```

2. **Remove Unused Indexes:**
- `ix_plugins_id` on primary key - **probably unnecessary** (PK is already indexed)

3. **Add Missing Indexes:**
- Consider indexing `plugins.enabled` if you frequently filter by it
- Consider indexing `plugins.display_order` if you often sort by it

### 4. ✅ Simplify Initial Schema

**Current: Multiple Migrations**
1. `9e9bc098186d` - Creates tables
2. `25a02026bccc` - Ensures tables exist (seems redundant)
3. Data migrations for themes

**Fresh Start: Single Clean Migration**

Create one initial migration with:
- All tables created at once
- All indexes defined
- No data migrations
- Clean schema from the start

**Benefits:**
- ✅ Simpler migration history
- ✅ Easier to understand
- ✅ No redundant "ensure exists" migrations

### 5. ✅ Startup Simplification

**Current Startup Sequence:**
```python
async def lifespan(app: FastAPI):
    await _initialize_database()
    await _initialize_plugins()
    await _sync_themes_to_db()  # ❌ Can be removed if themes not in DB
    # ...
```

**Optimized Startup:**
```python
async def lifespan(app: FastAPI):
    await connect_db()
    await _initialize_database()  # Just migrations, no data sync
    await _initialize_plugins()
    # No theme sync needed - loaded on-demand
    # ...
```

**Benefits:**
- ✅ Faster startup (no database writes for themes)
- ✅ Simpler code
- ✅ Less can go wrong

### Summary of Optimizations

| Area | Current | Optimized | Impact |
|------|---------|-----------|--------|
| **Themes** | Stored in DB + filesystem | Filesystem only | High - removes 2 migrations, runtime sync |
| **JSON Fields** | Custom `JSONEncodedDict` | Native `ormar.JSON()` | Medium - simpler code |
| **String Fields** | No length limits | Max length constraints | Low - better constraints |
| **Indexes** | Some basic indexes | Optimized composite indexes | Low - better performance |
| **Startup** | Sync themes to DB | No theme sync | Medium - faster startup |
| **Migrations** | 5 migrations (2 data) | 1 clean schema migration | High - much simpler |

### Recommended Changes Priority

**High Priority (Big Impact, Low Risk):**
1. ✅ **Remove theme database storage** - Load from filesystem only
2. ✅ **Use `ormar.JSON()`** - Remove `JSONEncodedDict` custom type
3. ✅ **Create clean initial migration** - Start fresh with Ormar

**Medium Priority (Good Impact):**
4. ✅ **Add string length constraints** - Better schema definition
5. ✅ **Optimize indexes** - Better query performance
6. ✅ **Remove theme sync from startup** - Faster startup

**Low Priority (Nice to Have):**
7. ⚠️ **Review field names** - Improve clarity
8. ⚠️ **Add check constraints** - Better validation
9. ⚠️ **Remove unused fields** - Cleaner schema

**Recommendation:** At minimum, do #1 (themes filesystem-only) - biggest simplification for least effort.

---

## Final Checklist

Before considering migration complete:

- [ ] All dependencies installed
- [ ] `database.py` updated
- [ ] All 4 models converted
- [ ] All services converted
- [ ] All API routes converted
- [ ] All tests updated and passing
- [ ] Application starts without errors
- [ ] Database operations work correctly
- [ ] No SQLAlchemy ORM imports remaining
- [ ] `JSONEncodedDict` class removed
- [ ] Documentation updated
- [ ] Code reviewed

---

## Estimated Time per Phase

- **Phase 1**: 15 minutes
- **Phase 2**: 30 minutes
- **Phase 3**: 1 hour
- **Phase 4**: 4-6 hours (services)
- **Phase 5**: 8-10 hours (routes)
- **Phase 6**: 8-10 hours (tests)
- **Phase 7**: 1-2 hours (cleanup)

**Total: 22-30 hours** (3-4 days of focused work)

---

## Next Steps After Migration

1. Monitor for any issues in production
2. Update documentation
3. Consider adding helper methods for common patterns
4. Remove any remaining SQLAlchemy ORM code
5. Celebrate! 🎉
