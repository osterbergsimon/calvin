# Plugin Architecture Analysis

## Current Architecture

### 1. Plugin Code Loading ✅
**Status: GOOD - Already modular**

Plugins are loaded from code modules (one per plugin):
- `app.plugins.calendar.google` → `GoogleCalendarPlugin`
- `app.plugins.calendar.ical` → `ICalCalendarPlugin`
- `app.plugins.image.local` → `LocalImagePlugin`
- `app.plugins.service.iframe` → `IframeServicePlugin`

**Plugin Type Registration:**
- Plugin types are registered in `PluginTypeRegistry` (`types.py`)
- Each plugin type has metadata: `type_id`, `name`, `description`, `plugin_class`, `common_config_schema`
- Plugin classes are hardcoded in `_register_default_types()` method

**Plugin Instance Creation:**
- Plugin instances are created in `PluginRegistry` (`registry.py`)
- Instances are created based on database records or hardcoded logic

### 2. Plugin Configuration Storage ⚠️
**Status: MIXED - Inconsistent approach**

#### Current Storage Strategy:

**A. Plugin Instances (per-instance config):**
- **Calendar plugins:** Stored in `CalendarSourceDB` table
  - Fields: `id`, `type`, `name`, `enabled`, `ical_url`, `api_key`, `color`, `show_time`
  - One row per calendar source instance
  
- **Service plugins:** Stored in `WebServiceDB` table
  - Fields: `id`, `name`, `url`, `enabled`, `display_order`, `fullscreen`
  - One row per web service instance

- **Image plugins:** Currently hardcoded
  - Single "local-images" instance created programmatically
  - Config stored in `ConfigDB` via `config_service` with key `plugin_local_config`
  - No dedicated table for image plugin instances

**B. Plugin Types (common config):**
- Stored in `ConfigDB` via `config_service` (key-value store)
  - Keys: `plugin_{type_id}_enabled` (e.g., `plugin_google_enabled`)
  - Keys: `plugin_{type_id}_config` (e.g., `plugin_local_config`)
  - Values: JSON strings

### 3. Current Flow

**On Startup:**
1. `PluginRegistry.load_plugins_from_db()` reads from:
   - `CalendarSourceDB` → creates calendar plugin instances
   - `WebServiceDB` → creates service plugin instances
   - Hardcoded logic → creates single local image plugin instance
2. Plugin instances registered in `PluginManager` (in-memory)
3. Plugin types registered in `PluginTypeRegistry` (hardcoded)

**On Runtime:**
- Plugin instances live in memory (`PluginManager`)
- Plugin type metadata lives in memory (`PluginTypeRegistry`)
- Config changes saved to database tables or `ConfigDB`

## Issues with Current Approach

### 1. **Inconsistent Storage**
- Calendar/Service plugins: Dedicated tables (`CalendarSourceDB`, `WebServiceDB`)
- Image plugins: Hardcoded + `ConfigDB` key-value store
- Plugin type common config: `ConfigDB` key-value store
- No unified approach

### 2. **Tight Coupling**
- Plugin type classes hardcoded in `PluginTypeRegistry`
- Plugin instance creation logic hardcoded in `PluginRegistry`
- Database schema tied to specific plugin types

### 3. **Limited Extensibility**
- Adding new plugin types requires code changes in multiple places:
  - Add plugin class file
  - Register in `PluginTypeRegistry`
  - Add creation logic in `PluginRegistry`
  - Potentially add new database table

### 4. **No Versioning**
- No plugin version tracking
- No plugin metadata (author, description, etc.) stored in DB

### 5. **Mixed Concerns**
- Plugin type metadata (code-level) mixed with plugin instance config (data-level)
- Common config (type-level) mixed with instance config (instance-level)

## Proposed Architecture

### Option 1: Unified Plugins Table (Recommended)

**Database Schema:**
```sql
CREATE TABLE plugins (
    id VARCHAR PRIMARY KEY,              -- Plugin instance ID
    type_id VARCHAR NOT NULL,            -- Plugin type ID (e.g., 'google', 'local')
    plugin_type VARCHAR NOT NULL,        -- Plugin category (CALENDAR, IMAGE, SERVICE)
    name VARCHAR NOT NULL,                -- Instance name
    version VARCHAR,                      -- Plugin version (optional)
    enabled BOOLEAN DEFAULT TRUE,
    config JSON,                          -- Instance-specific config (JSON field)
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE plugin_types (
    type_id VARCHAR PRIMARY KEY,          -- Plugin type ID (e.g., 'google', 'local')
    plugin_type VARCHAR NOT NULL,        -- Plugin category (CALENDAR, IMAGE, SERVICE)
    name VARCHAR NOT NULL,                -- Plugin type name
    description TEXT,                     -- Plugin type description
    version VARCHAR,                       -- Plugin type version
    common_config JSON,                   -- Common config schema (JSON field)
    enabled BOOLEAN DEFAULT TRUE,          -- Whether plugin type is enabled
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Benefits:**
- ✅ Unified storage for all plugin instances
- ✅ JSON field for flexible config (no schema changes for new plugins)
- ✅ Plugin versioning support
- ✅ Clear separation: plugin types vs. plugin instances
- ✅ Easy to query all plugins or filter by type
- ✅ Extensible: new plugin types don't require schema changes

**Migration:**
- Migrate `CalendarSourceDB` → `plugins` table (type_id='google'/'ical'/'proton')
- Migrate `WebServiceDB` → `plugins` table (type_id='iframe')
- Create `plugin_types` table from `PluginTypeRegistry` data

### Option 2: Keep Current Approach (Hybrid)

**Keep:**
- Dedicated tables for calendar/services (better type safety)
- `ConfigDB` for plugin type common config
- Hardcoded plugin type registration

**Improve:**
- Add `plugin_types` table for plugin type metadata
- Standardize image plugin storage (add table or use `plugins` table)
- Document the hybrid approach clearly

**Benefits:**
- ✅ Less migration work
- ✅ Type-safe for calendar/services
- ✅ Backward compatible

**Drawbacks:**
- ❌ Still inconsistent
- ❌ Still requires code changes for new plugin types

## Recommendation

**Go with Option 1 (Unified Plugins Table)** because:

1. **Future-proof:** JSON config field allows new plugin types without schema changes
2. **Consistent:** One way to store all plugin instances
3. **Extensible:** Easy to add new plugin types
4. **Clean separation:** Plugin types vs. instances clearly separated
5. **Versioning:** Built-in support for plugin versioning

**Migration Strategy:**
1. Create new `plugins` and `plugin_types` tables
2. Migrate existing data:
   - `CalendarSourceDB` → `plugins` (with type_id mapping)
   - `WebServiceDB` → `plugins` (with type_id='iframe')
   - `PluginTypeRegistry` → `plugin_types` table
3. Update `PluginRegistry` to load from `plugins` table
4. Keep old tables temporarily for backward compatibility
5. Remove old tables after migration verified

## Current vs. Proposed Comparison

| Aspect | Current | Proposed (Option 1) |
|--------|---------|-------------------|
| Plugin code loading | ✅ Modular (one per plugin) | ✅ Same (no change) |
| Plugin type storage | ❌ Hardcoded in code | ✅ Database table |
| Plugin instance storage | ⚠️ Mixed (tables + hardcoded) | ✅ Unified table |
| Config storage | ⚠️ Mixed (tables + ConfigDB) | ✅ JSON field in plugins table |
| Versioning | ❌ None | ✅ Built-in |
| Extensibility | ⚠️ Requires code changes | ✅ Just add plugin class |
| Type safety | ✅ Strong (dedicated tables) | ⚠️ JSON (flexible but less type-safe) |

## Conclusion

**Current approach is functional but inconsistent.** The proposed unified approach would:
- Simplify the codebase
- Make it easier to add new plugin types
- Provide better versioning and metadata tracking
- Maintain the modular plugin code structure (which is already good)

**Recommendation: Implement Option 1** with a careful migration plan to maintain backward compatibility during transition.

