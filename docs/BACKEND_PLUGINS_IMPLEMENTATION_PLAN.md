# Backend Plugins Implementation Plan

## Executive Summary

This document outlines the plan to implement a new **Backend Plugin** type for Calvin. Backend plugins provide generic backend/infrastructure functionality that doesn't fit into existing plugin categories (calendar, image, service, theme). They can include scheduled tasks, event handlers, data processors, sync services, and more.

**Primary Use Case**: Convert the IMAP plugin from an ImagePlugin to a BackendPlugin that downloads images to the local images directory, allowing LocalImagePlugin to handle sorting/display.

**Branch**: `feature/backend-plugins`

### Event System Architecture Decision

**Decision**: Use **asyncio-based in-memory event system** (no Redis/external queue framework initially)

**Rationale**:
- ✅ **No external dependencies**: Simpler deployment, no Redis/Celery setup required
- ✅ **Non-blocking**: Uses `asyncio.create_task()` for fire-and-forget pattern (default)
- ✅ **Good enough for initial use cases**: Handles < 1000 events/second (sufficient for Calvin)
- ✅ **Error isolation**: One bad handler doesn't crash system or block other handlers
- ✅ **Rate limiting**: Built-in rate limiting per plugin per event type (prevents event storms)
- ✅ **Future-proof**: Design allows migration to Redis later if needed

**When to Consider Redis/External Queue**:
- Event volume > 1000 events/second (asyncio bottleneck)
- Multi-process/multi-instance deployment (need cross-process events)
- Event persistence required (need to persist/replay events)
- Guaranteed delivery required (need ACK/retry mechanisms)
- Distributed systems (multiple Calvin instances need event sharing)

**Implementation**:
- **Fire-and-forget (default)**: Events emitted asynchronously, handlers run in background, don't wait for results
- **Fire-and-wait (optional)**: For critical events, wait for all handlers to complete
- **Error handling**: Errors isolated per handler, logged but not propagated
- **Rate limiting**: 10 events/second per plugin per event type (configurable)

---

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Problem Statement](#problem-statement)
3. [Proposed Solution](#proposed-solution)
4. [Use Cases](#use-cases)
5. [Detailed Implementation Plan](#detailed-implementation-plan)
6. [Migration Strategy](#migration-strategy)
7. [Testing Strategy](#testing-strategy)
8. [Risks and Mitigations](#risks-and-mitigations)

---

## Current Architecture Analysis

### Plugin Type System

**Current Plugin Types** (`backend/app/plugins/base.py`):
```python
class PluginType(str, Enum):
    CALENDAR = "calendar"
    IMAGE = "image"
    SERVICE = "service"
    THEME = "theme"
```

**Plugin Manager** (`backend/app/plugins/manager.py`):
- Manages plugin registration and lifecycle
- Tracks plugins by type in `_plugins_by_type` dictionary
- Currently only tracks: CALENDAR, IMAGE, SERVICE (no THEME tracking)
- Provides methods for initialization, cleanup, start/stop

**Plugin Loader** (`backend/app/plugins/loader.py`):
- Loads plugins from packages (`app.plugins.calendar`, `app.plugins.image`, `app.plugins.service`)
- Loads installed plugins from `data/plugins/`
- Uses pluggy for hook-based discovery
- Discovers plugins via `register_plugin_types()` hook

**Plugin Registry** (`backend/app/plugins/registry/`):
- `loader.py`: Loads plugin types and instances from database
- `manager.py`: Registers/unregisters plugins to database
- Bridges pluggy hooks ↔ database ↔ plugin manager

**Database Models** (`backend/app/models/db_models.py`):
- `PluginTypeDB`: Stores plugin type metadata (type_id, plugin_type, name, description, version, common_config_schema, enabled, error_message)
- `PluginDB`: Stores plugin instances (id, type_id, plugin_type, name, enabled, config, display_order)

**Protocols** (`backend/app/plugins/protocols.py`):
- `CalendarPlugin`: Must implement `fetch_events()`, `validate_config()`
- `ImagePlugin`: Must implement `get_images()`, `get_image()`, `get_image_data()`, `scan_images()`, `validate_config()`
- `ServicePlugin`: Must implement `get_content()`, `validate_config()`

### Current IMAP Plugin Implementation

**Location**: `backend/app/plugins/image/imap.py`

**Current Issues**:
1. Implements `ImagePlugin` but primarily downloads files, doesn't really "serve" images
2. Maintains its own image list and scanning logic (`_images`, `scan_images()`)
3. Implements its own sorting/ordering (via `get_images()`)
4. Has its own directory management and thumbnail generation
5. Provides `get_images()`, `get_image()`, `get_image_data()` methods that duplicate LocalImagePlugin functionality
6. Complexity: ~880 lines, ~300+ lines of code that could be removed

**What IMAP Should Do**:
- Connect to IMAP server periodically (scheduled task)
- Download image attachments from emails
- Save images to local images directory (used by LocalImagePlugin)
- Mark emails as read
- No need for image serving/viewing functionality

### Current Scheduler System

**Location**: `backend/app/services/scheduler.py`

**Current Implementation**:
- Uses APScheduler (AsyncIOScheduler)
- Currently only handles calendar refresh
- Hardcoded for calendar use case
- Not extensible for other scheduled tasks

**What We Need**:
- Generic scheduler that can handle scheduled tasks from backend plugins
- Support for interval-based scheduling (e.g., "every 5 minutes")
- Support for cron-based scheduling (e.g., "every day at 2 AM")
- Plugin-managed scheduled tasks (plugins register their own tasks)

### API Routes

**Plugin Management** (`backend/app/api/routes/plugins/management.py`):
- `GET /plugins`: Get all plugin types (filters by plugin_type)
- Currently supports: calendar, image, service, theme
- Would need to support: backend

**Frontend Integration**:
- Frontend displays plugins by type in tabs/categories
- Uses `plugin_type` to filter and group plugins
- Would need UI for backend plugins (likely in settings, minimal UI needed)

---

## Problem Statement

### Current Limitations

1. **IMAP Plugin Mismatch**: IMAP is classified as an ImagePlugin but doesn't fit the pattern
   - ImagePlugins should "serve" images
   - IMAP "downloads" images to a directory
   - This causes duplication of functionality (scanning, sorting, serving)

2. **No Generic Backend Functionality**: There's no category for plugins that:
   - Run scheduled tasks (cron-like jobs)
   - Process events asynchronously
   - Provide background services to other plugins
   - Don't need a UI component

3. **Limited Extensibility**: Adding new backend functionality requires:
   - Creating new services (not plugins)
   - Hardcoding in main application
   - Not using the plugin system for infrastructure tasks

### Benefits of Backend Plugins

1. **Separation of Concerns**: Downloaders vs. viewers
2. **Code Simplification**: Remove duplication (IMAP can be ~200 lines shorter)
3. **Extensibility**: Easy to add new backend functionality (RSS, cloud sync, etc.)
4. **Unified Image Handling**: LocalImagePlugin handles all sorting/display
5. **Plugin-to-Plugin Communication**: Backend plugins can provide services to other plugins

---

## Proposed Solution

### BackendPlugin Protocol

Create a new `BackendPlugin` protocol in `backend/app/plugins/protocols.py`:

```python
class BackendPlugin(BasePlugin):
    """Generic backend/infrastructure plugin protocol.
    
    Backend plugins provide background functionality such as:
    - Scheduled tasks (cron-like jobs)
    - Event handlers (respond to system events)
    - Background workers (long-running processes)
    - Service providers (provide services to other plugins)
    - Data processors (transform/process data)
    
    Plugins can implement any combination of optional capabilities.
    """
    
    @property
    def plugin_type(self) -> PluginType:
        return PluginType.BACKEND
    
    # Optional: Scheduled tasks
    async def get_schedule_config(self) -> dict[str, Any] | None:
        """Return schedule configuration if this plugin runs scheduled tasks.
        
        Returns dict with:
        - interval: int (seconds between runs, e.g., 300 for 5 minutes)
        - cron: str (cron expression, alternative to interval)
        - enabled: bool (whether scheduling is enabled)
        - max_concurrent: int (max concurrent executions, default: 1)
        
        Returns None if plugin doesn't support scheduled tasks.
        """
        return None
    
    async def run_scheduled_task(self) -> dict[str, Any]:
        """Execute scheduled task. Called by scheduler if get_schedule_config() returns config.
        
        Returns:
            Dictionary with execution result:
            - success: bool
            - message: str (optional)
            - data: dict (optional, plugin-specific data)
        """
        raise NotImplementedError("This plugin doesn't support scheduled tasks")
    
    # Optional: Event handlers
    async def handle_event(self, event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
        """Handle system events. Called when events matching this plugin's interests occur.
        
        Args:
            event_type: Type of event (e.g., 'image_uploaded', 'plugin_enabled')
            event_data: Event payload (plugin-specific)
        
        Returns:
            Dictionary with result, or None if event not handled
        """
        return None
    
    async def get_subscribed_events(self) -> list[str]:
        """Return list of event types this plugin subscribes to.
        
        Returns:
            List of event type strings (e.g., ['image_uploaded', 'config_changed'])
        """
        return []
    
    # Optional: Background workers
    async def start_worker(self) -> None:
        """Start background worker. Called when plugin is enabled.
        
        This is for long-running background processes that don't fit
        into scheduled tasks or event handlers.
        """
        pass
    
    async def stop_worker(self) -> None:
        """Stop background worker. Called when plugin is disabled."""
        pass
    
    # Optional: Service provider (for other plugins to use)
    async def provide_service(self, service_name: str, **kwargs) -> Any:
        """Provide service to other plugins. Return None if service not supported.
        
        Args:
            service_name: Name of service (e.g., 'get_weather_data', 'process_image')
            **kwargs: Service-specific arguments
        
        Returns:
            Service result (type depends on service), or None if not supported
        """
        return None
    
    async def get_provided_services(self) -> list[str]:
        """Return list of services this plugin provides.
        
        Returns:
            List of service names (e.g., ['get_weather_data', 'process_image'])
        """
        return []
    
    # Required: Basic validation
    @abstractmethod
    async def validate_config(self, config: dict[str, Any]) -> bool:
        """Validate plugin configuration."""
        pass
```

### Plugin Type Enum Update

```python
class PluginType(str, Enum):
    CALENDAR = "calendar"
    IMAGE = "image"
    SERVICE = "service"
    THEME = "theme"
    BACKEND = "backend"  # NEW
```

### Generic Scheduler Service

Create `backend/app/services/backend_scheduler.py`:

```python
class BackendPluginScheduler:
    """Scheduler for backend plugin scheduled tasks."""
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._registered_tasks: dict[str, str] = {}  # plugin_id -> job_id
    
    async def register_plugin_tasks(self, plugin: BackendPlugin) -> None:
        """Register scheduled tasks for a backend plugin."""
        schedule_config = await plugin.get_schedule_config()
        if schedule_config and schedule_config.get("enabled", False):
            # Register task with scheduler
            # ...
    
    async def unregister_plugin_tasks(self, plugin_id: str) -> None:
        """Unregister scheduled tasks for a plugin."""
        # ...
```

---

## Use Cases

### 1. IMAP Email Downloader (Scheduled Task)

**Type**: Scheduled task plugin
**Purpose**: Download images from email attachments

**Implementation**:
- Implements `get_schedule_config()` → returns `{"interval": 300, "enabled": True}`
- Implements `run_scheduled_task()` → downloads images, saves to local images directory
- No image serving/viewing methods needed
- Result: ~200 lines of code removed (no `get_images()`, `scan_images()`, etc.)

**Configuration**:
```json
{
  "email_address": "user@example.com",
  "email_password": "***",
  "imap_server": "imap.gmail.com",
  "imap_port": 993,
  "check_interval": 300,
  "mark_as_read": true,
  "target_directory": "./data/images"  // Where to save downloaded images
}
```

### 2. RSS Feed Image Downloader (Scheduled Task)

**Type**: Scheduled task plugin
**Purpose**: Download images from RSS feeds

**Similar to IMAP**: Runs periodically, downloads images to local directory

### 3. Image Processor (Event-Driven)

**Type**: Event handler plugin
**Purpose**: Process images when uploaded (resize, optimize, generate thumbnails)

**Implementation**:
- Implements `get_subscribed_events()` → returns `["image_uploaded"]`
- Implements `handle_event()` → processes image when event received
- Can be triggered by LocalImagePlugin when image is uploaded

### 4. System Monitor (Background Worker)

**Type**: Background worker plugin
**Purpose**: Monitor system resources (CPU, memory, disk)

**Implementation**:
- Implements `start_worker()` → starts monitoring loop
- Implements `provide_service("system_stats")` → other plugins can query stats
- Continuously monitors and updates internal state

### 5. API Aggregator (Scheduled + Service Provider)

**Type**: Scheduled task + service provider
**Purpose**: Fetch weather data periodically, serve to other plugins

**Implementation**:
- Implements `get_schedule_config()` → fetches data every 15 minutes
- Implements `run_scheduled_task()` → fetches and stores weather data
- Implements `provide_service("get_weather_data")` → other plugins can query data

### 6. Cache Cleaner (Scheduled Task)

**Type**: Scheduled task plugin
**Purpose**: Clean up expired cache entries

**Implementation**:
- Implements `get_schedule_config()` → runs daily at 2 AM
- Implements `run_scheduled_task()` → cleans cache

### 7. File Sync Service (Scheduled Task)

**Type**: Scheduled task plugin
**Purpose**: Sync files between directories or remote locations

**Implementation**:
- Implements `get_schedule_config()` → syncs every hour
- Implements `run_scheduled_task()` → performs sync operation

---

## Detailed Implementation Plan

### Phase 1: Core Infrastructure ✅ COMPLETED

#### 1.1 Add BACKEND to PluginType Enum ✅

**File**: `backend/app/plugins/base.py`

**Status**: ✅ **COMPLETED**
- Added `BACKEND = "backend"` to `PluginType` enum

**Testing**: ✅
- Verified enum value is correct
- Existing code works correctly

#### 1.2 Update PluginManager ✅

**File**: `backend/app/plugins/manager.py`

**Status**: ✅ **COMPLETED**
- Added `PluginType.BACKEND: []` to `_plugins_by_type` initialization
- Fixed KeyError handling for new plugin types
- Added scheduled task registration/unregistration for backend plugins

**Testing**: ✅
- Backend plugins can be registered
- They're tracked in the manager
- Scheduled tasks are registered/unregistered correctly

#### 1.3 Create BackendPlugin Protocol ✅

**File**: `backend/app/plugins/protocols.py`

**Status**: ✅ **COMPLETED**
- Added `BackendPlugin` protocol with optional methods:
  - `get_schedule_config()` → returns schedule configuration
  - `run_scheduled_task()` → executes scheduled task
  - `handle_event()` → handles system events (deferred)
  - `get_subscribed_events()` → returns subscribed event types (deferred)
  - `start_worker()` / `stop_worker()` → background workers (deferred)
  - `provide_service()` / `get_provided_services()` → service providers (deferred)
- Uses Protocol typing for better type safety

**Testing**: ✅
- Created unit tests for BackendPlugin protocol
- Verified optional methods work correctly
- Tested with mock backend plugins

#### 1.4 Update Plugin Loader ✅

**File**: `backend/app/plugins/loader.py`

**Status**: ✅ **COMPLETED**
- Initially added `self.load_plugins_from_package("app.plugins.backend")` to `load_all_plugins()`
- Removed after IMAP plugin was moved to `calvin-plugins` repository
- Backend plugins are now loaded from installed plugins directory

**Testing**: ✅
- Backend plugins are loaded from installed plugins
- They appear in plugin type list

### Phase 2: Scheduler Infrastructure ✅ COMPLETED

#### 2.1 Create Backend Plugin Scheduler Service ✅

**File**: `backend/app/services/backend_scheduler.py` (NEW)

**Status**: ✅ **COMPLETED**
- Created `BackendPluginScheduler` class
- Uses APScheduler (AsyncIOScheduler)
- Methods implemented:
  - `start()`: Start scheduler
  - `stop()`: Stop scheduler
  - `register_plugin_tasks(plugin)`: Register scheduled tasks for a plugin
  - `unregister_plugin_tasks(plugin_id)`: Unregister tasks
  - `_run_task()`: Internal method to execute plugin tasks with error handling

**Scheduling Support**: ✅
- Interval-based: `{"interval": 300, "enabled": True}` → runs every 300 seconds
- Cron-based: `{"cron": "0 2 * * *", "enabled": True}` → runs daily at 2 AM
- Supports both, prefers interval if both provided
- Error handling and logging for task execution

**Testing**: ✅
- Created comprehensive unit tests (`test_backend_scheduler.py`)
- Verified task registration/unregistration
- Verified task execution at correct intervals
- Verified error handling

#### 2.2 Integrate Scheduler with Plugin Manager ✅

**File**: `backend/app/plugins/manager.py`

**Status**: ✅ **COMPLETED**
- In `register()`: If plugin is BackendPlugin and has schedule config, register with scheduler
- In `unregister()`: Unregister from scheduler
- In `initialize_all()`: Register scheduled tasks for all enabled backend plugins
- Proper async cleanup handling

**File**: `backend/app/main.py`

**Status**: ✅ **COMPLETED**
- Imported `BackendPluginScheduler`
- Initialize scheduler on startup
- Start scheduler after plugin initialization
- Stop scheduler on shutdown

**Testing**: ✅
- Scheduler starts on app startup
- Plugin tasks are registered when plugin is enabled
- Plugin tasks are unregistered when plugin is disabled
- Integration tests verify full lifecycle

### Phase 3: Event System ⏸️ DEFERRED

**Status**: ⏸️ **DEFERRED** - As per user request, event system implementation is deferred to a later phase.

**Rationale**: Keep initial implementation simpler and focused on scheduled tasks. Event system can be added when needed.

#### 3.1 Design Event System Architecture

**Design Principles**:
1. **Non-blocking**: Event emission must not block the main application
2. **Fire-and-forget**: Events are emitted asynchronously, handlers run in background
3. **Error isolation**: One bad handler cannot crash the system or block other handlers
4. **No external dependencies**: Use asyncio only, no Redis/Celery/etc.
5. **Simple and lightweight**: Start simple, can be extended later if needed

**Event Delivery Patterns**:
- **Fire-and-forget (default)**: Emit event, handlers run asynchronously, don't wait for results
- **Fire-and-wait (optional)**: Emit event, wait for all handlers to complete (for critical events)

**Implementation Strategy**:
- Use `asyncio.create_task()` for non-blocking event delivery
- Use `asyncio.gather()` with `return_exceptions=True` for parallel handler execution
- Isolate errors per handler (log errors, don't propagate)
- Optional: Rate limiting per plugin (prevent event storms)
- Optional: Event filtering (plugins can specify event filters)

#### 3.2 Create Event System

**File**: `backend/app/services/event_system.py` (NEW)

**Implementation**:
```python
class EventSystem:
    """Lightweight, non-blocking event system using asyncio."""
    
    def __init__(self):
        self._subscribers: dict[str, list[tuple[str, Callable]]] = {}  # event_type -> [(plugin_id, handler), ...]
        self._rate_limiter: dict[str, dict[str, float]] = {}  # plugin_id -> {event_type: last_emit_time}
        self._max_events_per_second = 10  # Rate limit per plugin per event type
    
    async def emit_event(
        self,
        event_type: str,
        event_data: dict[str, Any],
        wait_for_handlers: bool = False
    ) -> dict[str, Any] | None:
        """Emit an event to all subscribed plugins.
        
        Args:
            event_type: Type of event (e.g., 'image_uploaded')
            event_data: Event payload (plugin-specific)
            wait_for_handlers: If True, wait for all handlers to complete (fire-and-wait)
                              If False, return immediately (fire-and-forget, default)
        
        Returns:
            If wait_for_handlers=True: dict with handler results
            If wait_for_handlers=False: None (returns immediately)
        """
        if event_type not in self._subscribers:
            return None if not wait_for_handlers else {}
        
        handlers = self._subscribers[event_type]
        if not handlers:
            return None if not wait_for_handlers else {}
        
        # Create tasks for all handlers (non-blocking)
        tasks = []
        for plugin_id, handler in handlers:
            # Check rate limiting
            if self._should_rate_limit(plugin_id, event_type):
                continue
            
            # Create task for handler (runs in background)
            task = self._create_handler_task(plugin_id, handler, event_type, event_data)
            tasks.append(task)
        
        if not tasks:
            return None if not wait_for_handlers else {}
        
        if wait_for_handlers:
            # Wait for all handlers to complete
            results = await asyncio.gather(*tasks, return_exceptions=True)
            return self._process_handler_results(results, handlers)
        else:
            # Fire-and-forget: don't wait for handlers
            # Tasks run in background, errors are logged but not propagated
            asyncio.create_task(self._await_handlers_with_error_handling(tasks, handlers))
            return None
    
    def _create_handler_task(
        self,
        plugin_id: str,
        handler: Callable,
        event_type: str,
        event_data: dict[str, Any]
    ) -> asyncio.Task:
        """Create a task for a handler with error isolation."""
        async def safe_handler():
            try:
                result = await handler(event_type, event_data)
                return {"plugin_id": plugin_id, "success": True, "result": result}
            except Exception as e:
                logger.error(
                    f"Error in event handler {plugin_id} for event {event_type}: {e}",
                    exc_info=True
                )
                return {"plugin_id": plugin_id, "success": False, "error": str(e)}
        
        return asyncio.create_task(safe_handler())
    
    async def _await_handlers_with_error_handling(
        self,
        tasks: list[asyncio.Task],
        handlers: list[tuple[str, Callable]]
    ) -> None:
        """Await handlers and log errors without propagating."""
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result, (plugin_id, _) in zip(results, handlers):
            if isinstance(result, Exception):
                logger.error(
                    f"Exception in event handler {plugin_id}: {result}",
                    exc_info=True
                )
            elif result and not result.get("success", False):
                logger.warning(
                    f"Event handler {plugin_id} returned error: {result.get('error')}"
                )
    
    def _should_rate_limit(self, plugin_id: str, event_type: str) -> bool:
        """Check if plugin should be rate-limited for this event type."""
        import time
        
        now = time.time()
        plugin_limits = self._rate_limiter.get(plugin_id, {})
        last_emit = plugin_limits.get(event_type, 0)
        
        min_interval = 1.0 / self._max_events_per_second
        if now - last_emit < min_interval:
            return True
        
        # Update last emit time
        if plugin_id not in self._rate_limiter:
            self._rate_limiter[plugin_id] = {}
        self._rate_limiter[plugin_id][event_type] = now
        
        return False
    
    def subscribe(self, plugin_id: str, event_types: list[str], handler: Callable) -> None:
        """Subscribe a plugin to event types.
        
        Args:
            plugin_id: ID of plugin subscribing
            event_types: List of event types to subscribe to
            handler: Async function(event_type, event_data) -> dict | None
        """
        for event_type in event_types:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []
            
            # Remove existing subscription if present
            self._subscribers[event_type] = [
                (pid, h) for pid, h in self._subscribers[event_type] if pid != plugin_id
            ]
            
            # Add new subscription
            self._subscribers[event_type].append((plugin_id, handler))
            logger.debug(f"Plugin {plugin_id} subscribed to event type {event_type}")
    
    def unsubscribe(self, plugin_id: str, event_types: list[str] | None = None) -> None:
        """Unsubscribe a plugin from event types.
        
        Args:
            plugin_id: ID of plugin to unsubscribe
            event_types: List of event types (None = unsubscribe from all)
        """
        if event_types is None:
            # Unsubscribe from all event types
            for event_type in list(self._subscribers.keys()):
                self._subscribers[event_type] = [
                    (pid, h) for pid, h in self._subscribers[event_type] if pid != plugin_id
                ]
        else:
            # Unsubscribe from specific event types
            for event_type in event_types:
                if event_type in self._subscribers:
                    self._subscribers[event_type] = [
                        (pid, h) for pid, h in self._subscribers[event_type] if pid != plugin_id
                    ]
        
        # Clean up rate limiter
        if plugin_id in self._rate_limiter:
            del self._rate_limiter[plugin_id]
        
        logger.debug(f"Plugin {plugin_id} unsubscribed from events")
    
    def _process_handler_results(
        self,
        results: list[Any],
        handlers: list[tuple[str, Callable]]
    ) -> dict[str, Any]:
        """Process handler results when waiting for handlers."""
        processed = {}
        for result, (plugin_id, _) in zip(results, handlers):
            if isinstance(result, Exception):
                processed[plugin_id] = {"success": False, "error": str(result)}
            elif isinstance(result, dict):
                processed[plugin_id] = result
            else:
                processed[plugin_id] = {"success": True, "result": result}
        return processed
```

**Event Types** (initial):
- `image_uploaded`: Image was uploaded via LocalImagePlugin
  - `event_data`: `{"image_id": str, "filename": str, "path": str, "plugin_id": str}`
- `image_deleted`: Image was deleted via LocalImagePlugin
  - `event_data`: `{"image_id": str, "filename": str, "plugin_id": str}`
- `plugin_enabled`: A plugin was enabled
  - `event_data`: `{"plugin_id": str, "plugin_type": str}`
- `plugin_disabled`: A plugin was disabled
  - `event_data`: `{"plugin_id": str, "plugin_type": str}`
- `config_changed`: Configuration changed
  - `event_data`: `{"key": str, "old_value": Any, "new_value": Any}`

**Plugin Event Emission**:
- Plugins can emit events using `await self.emit_event(event_type, event_data, wait_for_handlers=False)`
- All plugins inherit `emit_event()` from `BasePlugin`
- Plugins can define custom event types for plugin-to-plugin communication
- Example: A backend plugin processing images can emit `image_processed` events
- Example: A sync plugin can emit `sync_completed` events

**Testing**:
- Create test plugin that subscribes to events
- Emit test events (fire-and-forget)
- Verify plugin receives events asynchronously
- Verify errors in handlers don't crash system
- Test fire-and-wait mode
- Test rate limiting
- Verify unsubscription works

#### 3.2 Integrate Event System with Plugins

**File**: `backend/app/plugins/manager.py`

**Changes**:
- In `register()`: Subscribe plugin to events if it implements `get_subscribed_events()`
- In `unregister()`: Unsubscribe from events
- In `enable()`: Re-subscribe to events
- In `disable()`: Un-subscribe from events (optional)

**Integration Pattern**:
```python
# In PluginManager.register()
if isinstance(plugin, BackendPlugin):
    subscribed_events = await plugin.get_subscribed_events()
    if subscribed_events:
        # Create handler wrapper
        async def event_handler(event_type: str, event_data: dict[str, Any]) -> dict[str, Any] | None:
            return await plugin.handle_event(event_type, event_data)
        
        # Subscribe to events
        event_system.subscribe(plugin.plugin_id, subscribed_events, event_handler)
```

**File**: `backend/app/services/plugin_image_service.py`

**Changes**:
- Emit `image_uploaded` event when image is uploaded via `upload_image()`
- Emit `image_deleted` event when image is deleted via `delete_image()`

**Event Emission Pattern** (non-blocking):
```python
# Fire-and-forget: don't wait for handlers
await event_system.emit_event(
    "image_uploaded",
    {
        "image_id": image_id,
        "filename": filename,
        "path": image_path,
        "plugin_id": self.plugin_id
    },
    wait_for_handlers=False  # Default: non-blocking
)

# Fire-and-wait: wait for handlers (for critical events)
results = await event_system.emit_event(
    "critical_config_changed",
    {"key": key, "old_value": old_value, "new_value": new_value},
    wait_for_handlers=True  # Wait for all handlers
)
```

**Testing**:
- Upload image, verify backend plugins receive event asynchronously (non-blocking)
- Delete image, verify event is emitted
- Enable/disable plugin, verify event subscription changes
- Test error isolation (bad handler doesn't crash system)

#### 3.3 When to Use External Queue Frameworks (Future Consideration)

**Current Implementation (asyncio-based) is sufficient for**:
- Low-to-medium event volume (< 1000 events/second)
- Single-process application
- Fire-and-forget event delivery (non-critical events)
- In-memory event delivery (no persistence required)
- Plugin-to-plugin communication within same process

**Consider Redis/Celery/RQ if**:
- **High event volume** (> 1000 events/second): asyncio may become bottleneck
- **Multi-process/multi-instance**: Need cross-process event delivery
- **Event persistence**: Need to persist events for replay/audit
- **Guaranteed delivery**: Need ACK/retry mechanisms for critical events
- **Event ordering**: Need strict ordering guarantees across events
- **Event replay**: Need to replay events after plugin restart
- **Distributed systems**: Multiple Calvin instances need event sharing

**Migration Path (if needed later)**:
1. Keep asyncio-based implementation as default
2. Add optional Redis backend (opt-in via config)
3. Abstract event system interface (EventSystem interface, AsyncIOEventSystem and RedisEventSystem implementations)
4. Allow plugins to specify delivery guarantees (at-least-once, at-most-once, exactly-once)

**Implementation Example (future)**:
```python
# backend/app/services/event_system/interface.py
class EventSystem(ABC):
    @abstractmethod
    async def emit_event(...) -> ...:
        pass

# backend/app/services/event_system/asyncio_impl.py
class AsyncIOEventSystem(EventSystem):
    # Current implementation
    
# backend/app/services/event_system/redis_impl.py (future)
class RedisEventSystem(EventSystem):
    # Redis-based implementation for distributed systems
```

**Decision**: Start with asyncio-based implementation, migrate to Redis if/when needed based on actual usage patterns.

### Phase 4: Database and API Updates ✅ COMPLETED

#### 4.1 Update Database Models ✅

**File**: `backend/app/models/db_models.py`

**Status**: ✅ **COMPLETED**
- No changes needed! `PluginTypeDB` already stores `plugin_type` as string
- Existing database works with new plugin_type value
- Created Alembic migration for IMAP plugin type conversion

**Testing**: ✅
- Backend plugin types can be created in database
- They can be queried correctly
- They appear in API responses

#### 4.2 Update API Routes ✅

**File**: `backend/app/api/routes/plugins/management.py`

**Status**: ✅ **COMPLETED**
- Updated `get_plugins()` to accept `plugin_type="backend"`
- Added validation for "backend" type in plugin_type filter
- Updated valid_types to include "backend"
- Simplified `update_plugin()` route to only handle plugin types (not instances)
- Removed instance ID fallback logic
- Consolidated to single session, single commit pattern
- Fixed enable/disable persistence issues

**File**: `backend/app/api/routes/plugins/instances.py` (NEW)

**Status**: ✅ **COMPLETED**
- Created dedicated route for plugin instance management
- `PUT /plugins/instances/{instance_id}`: Update instance (enabled, config, name)
- `POST /plugins/instances/{instance_id}/start`: Start instance
- `POST /plugins/instances/{instance_id}/stop`: Stop instance
- `GET /plugins/{plugin_id}/instances`: Get all instances for a plugin type
- `PUT /plugins/{plugin_id}/instances/order`: Update instance display order
- `DELETE /plugins/instances/{instance_id}`: Delete instance
- Proper lifecycle management (start/stop, scheduled task registration)

**Testing**: ✅
- `GET /plugins?plugin_type=backend` returns backend plugins
- `GET /plugins` includes backend plugins
- Can create/update/delete backend plugin instances
- Instance enable/disable works correctly
- Scheduled tasks are registered/unregistered on instance enable/disable

#### 4.3 Add Backend Plugin Actions Endpoint ⏸️ DEFERRED

**Status**: ⏸️ **DEFERRED** - Can be added later if needed. Manual task triggering can be done via plugin instance management.

### Phase 5: Convert IMAP Plugin ✅ COMPLETED

#### 5.1 Create New IMAP Backend Plugin ✅

**File**: `calvin-plugins/imap/plugin.py` (NEW - moved to calvin-plugins repository)

**Status**: ✅ **COMPLETED**
- Converted from `ImagePlugin` to `BackendPlugin`
- Removed: `get_images()`, `get_image()`, `get_image_data()`, `scan_images()` methods
- Kept: IMAP connection logic, email checking, image downloading
- Added: `get_schedule_config()`, `run_scheduled_task()`
- Configuration: Uses `target_directory` config (defaults to local images dir)

**Key Changes**: ✅
- Downloads images to `target_directory` (shared with LocalImagePlugin)
- No longer maintains own image list
- No longer implements ImagePlugin protocol
- Much simpler implementation focused on downloading

**Testing**: ✅
- IMAP backend plugin can be configured
- Downloads images correctly
- Images appear in LocalImagePlugin
- Scheduled task runs periodically
- Integration tests verify full workflow

#### 5.2 Update IMAP Hooks ✅

**File**: `calvin-plugins/imap/plugin.py`

**Status**: ✅ **COMPLETED**
- Updated `register_plugin_types()` to return backend plugin type
- Updated `create_plugin_instance()` to create BackendPlugin
- Updated `handle_plugin_config_update()` for backend plugin type
- Handles instance ID correctly from config
- Proper instance management

**Testing**: ✅
- IMAP plugin type is registered as backend
- Instances can be created
- Config updates work correctly
- Instance enable/disable works

#### 5.3 Migrate Existing IMAP Instances ✅

**File**: `backend/alembic/versions/0ff1074a0483_migrate_imap_from_image_to_backend_.py` (NEW)

**Status**: ✅ **COMPLETED**
- Created Alembic migration script
- Migrates existing IMAP ImagePlugin instances to BackendPlugin instances
- Updates plugin type in database
- Updates plugin instances with new type
- Idempotent migration (safe to run multiple times)

**Steps**: ✅
1. Finds all IMAP ImagePlugin instances in database
2. Updates plugin type from "image" to "backend"
3. Updates all plugin instances to use new type
4. Logs migration results

**Testing**: ✅
- Migration script tested on test database
- Old instances are updated correctly
- New instances work with backend plugin type
- Migration is idempotent
- Integration tests verify migration

#### 5.4 Update Documentation ✅

**File**: `docs/IMAP_LOCAL_IMAGES_RELATIONSHIP.md`

**Status**: ✅ **COMPLETED**
- Updated to reflect IMAP is now a backend plugin
- Updated description of how it works
- Clarified that LocalImagePlugin handles all image serving

**File**: `docs/BACKEND_PLUGINS_IMPLEMENTATION_PLAN.md` (THIS FILE)

**Status**: ✅ **COMPLETED**
- Comprehensive documentation of backend plugin architecture
- Use cases and development guide
- Implementation details and decisions

### Phase 6: Frontend Updates ✅ COMPLETED

#### 6.1 Update Plugin Type Display ✅

**File**: `frontend/src/composables/usePlugins.js`

**Status**: ✅ **COMPLETED**
- Added "backend" to plugin type categories
- Added to `sortedPluginCategories` computed property
- Backend plugins are filtered and displayed correctly
- Updated `updatePluginInstance` to use new dedicated API route

**Testing**: ✅
- Backend plugins appear in settings
- They can be configured
- UI is appropriate (minimal for backend plugins)
- Unit tests verify composable behavior

#### 6.2 Add Backend Plugin Actions UI ✅

**File**: `frontend/src/components/settings/specialized/PluginManager.vue`

**Status**: ✅ **COMPLETED**
- Added "Backend" tab with 🔧 icon
- Backend and Theme tabs always visible
- Plugin cards display backend plugins correctly
- Instance toggling works via dedicated API route

**File**: `frontend/src/components/settings/specialized/PluginCard.vue`

**Status**: ✅ **COMPLETED**
- Added CSS styling for `.type-backend` badge
- Backend plugins display with correct badge

**File**: `frontend/src/components/settings/specialized/PluginInstaller.vue`

**Status**: ✅ **COMPLETED**
- Added CSS styling for `.type-backend` badge (small version)
- Backend plugins appear in installer view

**File**: `frontend/src/services/pluginsApi.js`

**Status**: ✅ **COMPLETED**
- Updated `updatePluginInstance` to use `PUT /plugins/instances/{instance_id}`
- Added `deletePluginInstance` method
- Proper error handling

**Testing**: ✅
- Backend plugins can be configured via UI
- Instance toggling works correctly
- Unit tests verify component behavior
- E2E tests verify end-to-end functionality

#### 6.3 Update Plugin Type Filters ✅

**File**: `frontend/src/components/settings/categories/PluginsCategory.vue`

**Status**: ✅ **COMPLETED**
- Added "backend" as valid plugin type
- Added backend plugins tab/section
- Updated `handleToggleInstance` to use new API route
- Backend plugins handled appropriately

**File**: `frontend/src/components/settings/specialized/PluginManager.vue`

**Status**: ✅ **COMPLETED**
- Backend tab always visible
- Proper filtering and display

**Testing**: ✅
- Backend plugins appear in correct section
- Filtering works correctly
- Tab navigation works

### Phase 7: Testing and Documentation ✅ COMPLETED

#### 7.1 Unit Tests ✅

**Files**: `backend/tests/unit/`

**Status**: ✅ **COMPLETED**

**Test Files**:
- `test_plugin_protocols.py`: Test BackendPlugin protocol ✅
- `test_backend_scheduler.py`: Test scheduler service ✅
- `test_plugin_manager_backend.py`: Test PluginManager backend plugin handling ✅
- `test_instance_update.py`: Test instance update logic ✅
- `test_plugin_installer.py`: Test plugin installer with backend plugins ✅

**Coverage**: ✅
- Protocol methods (scheduled tasks)
- Scheduler registration/unregistration
- Plugin manager backend plugin handling
- Instance update lifecycle
- Plugin installation validation

#### 7.2 Integration Tests ✅

**Files**: `backend/tests/integration/`

**Status**: ✅ **COMPLETED**

**Test Files**:
- `test_api_instance_update.py`: Test plugin type and instance enable/disable, instance updates ✅
- `test_imap_migration.py`: Test IMAP migration script ✅
- `test_simple_plugin_enable.py`: Simple test for plugin enable/disable ✅
- `test_api_plugins.py`: Updated to include backend plugin tests ✅

**Coverage**: ✅
- Plugin type enable/disable via API
- Plugin instance enable/disable via API
- Instance configuration updates
- Scheduled task registration/unregistration on enable/disable
- IMAP migration script
- Full plugin lifecycle

#### 7.3 Frontend Tests ✅

**Files**: `frontend/tests/`

**Status**: ✅ **COMPLETED**

**Test Files**:
- `unit/composables/usePlugins.spec.js`: Test usePlugins composable with backend plugins ✅
- `unit/components/PluginManager.spec.js`: Test PluginManager component ✅
- `unit/components/PluginInstanceToggle.spec.js`: Test instance toggle component ✅
- `e2e/backend-plugins.spec.js`: E2E tests for backend plugins ✅
- `e2e/plugin-instance-toggle.spec.js`: E2E tests for instance toggling ✅

**Coverage**: ✅
- Backend plugin display and filtering
- Instance toggling
- Plugin installation
- Component rendering

#### 7.4 Documentation ✅

**Files**:

**Status**: ✅ **COMPLETED**
- `docs/BACKEND_PLUGINS_IMPLEMENTATION_PLAN.md`: Comprehensive implementation plan (THIS FILE) ✅
- `docs/IMAP_LOCAL_IMAGES_RELATIONSHIP.md`: Updated IMAP documentation ✅
- `docs/IMPROVEMENTS.md`: Updated with backend plugins progress ✅

### Phase 8: Cleanup and Polish ✅ COMPLETED

#### 8.1 Remove Old IMAP Image Plugin ✅

**File**: `backend/app/plugins/image/imap.py`

**Status**: ✅ **COMPLETED**
- Deleted old IMAP ImagePlugin file
- Migration script handles existing installations
- New IMAP plugin is in `calvin-plugins` repository

#### 8.2 Update Plugin Loader ✅

**File**: `backend/app/plugins/loader.py`

**Status**: ✅ **COMPLETED**
- Removed `app.plugins.backend` package loading (IMAP moved to calvin-plugins)
- Created `app/plugins/backend/__init__.py` for future core backend plugins
- All plugins load correctly
- Backend plugins load from installed plugins directory

#### 8.3 Code Review and Refactoring ✅

**Status**: ✅ **COMPLETED**
- Reviewed all changes
- Simplified plugin type update route (removed duplicate enabled setting)
- Consolidated to single session, single commit pattern
- Removed redundant `flag_modified` calls
- Fixed enable/disable persistence issues
- Fixed all linting issues (line length, unused variables)
- Updated type hints
- Added comprehensive docstrings

#### 8.4 Final Testing ✅

**Status**: ✅ **COMPLETED**
- Full system test with all plugin types ✅
- Tested migration from old to new IMAP ✅
- All unit tests passing ✅
- All integration tests passing ✅
- All frontend tests passing ✅
- Edge case testing completed ✅

---

## Migration Strategy

### IMAP Plugin Migration

**Step 1: Create Backend IMAP Plugin**
- Create new `backend/app/plugins/backend/imap.py`
- Implement as BackendPlugin
- Test independently

**Step 2: Migration Script**
- Create migration script to convert existing instances
- Run on test database first
- Test migration thoroughly

**Step 3: Dual Support (Optional)**
- Temporarily support both ImagePlugin and BackendPlugin IMAP
- Allow users to migrate manually via UI
- Or auto-migrate on startup

**Step 4: Remove Old Implementation**
- After migration is verified, remove old IMAP ImagePlugin
- Update all references

**Migration Script Logic**:
```python
async def migrate_imap_instances():
    """Migrate IMAP ImagePlugin instances to BackendPlugin instances."""
    async with AsyncSessionLocal() as session:
        # Find all IMAP ImagePlugin instances
        result = await session.execute(
            select(PluginDB).where(
                PluginDB.type_id == "imap",
                PluginDB.plugin_type == "image"
            )
        )
        old_instances = result.scalars().all()
        
        for old_instance in old_instances:
            # Create new backend plugin instance
            new_id = old_instance.id  # Keep same ID
            new_config = old_instance.config.copy()
            
            # Add target_directory if not present (defaults to local images dir)
            if "target_directory" not in new_config:
                new_config["target_directory"] = "./data/images"
            
            # Create new instance (this will register it)
            new_instance = await register_plugin(
                plugin_id=new_id,
                type_id="imap",
                name=old_instance.name,
                config=new_config,
                enabled=old_instance.enabled
            )
            
            # Delete old instance from database
            await session.delete(old_instance)
            
        await session.commit()
```

---

## Testing Strategy

### Unit Tests

1. **BackendPlugin Protocol**
   - Test optional methods return correct defaults
   - Test abstract method (`validate_config`) is required
   - Test plugin type property

2. **Scheduler Service**
   - Test task registration/unregistration
   - Test interval-based scheduling
   - Test cron-based scheduling
   - Test concurrent execution limits
   - Test task execution and error handling

3. **Event System**
   - Test event emission
   - Test subscription/unsubscription
   - Test event delivery to plugins
   - Test multiple subscribers

4. **IMAP Backend Plugin**
   - Test schedule config
   - Test scheduled task execution
   - Test IMAP connection
   - Test image downloading
   - Test file saving to target directory

### Integration Tests

1. **Plugin Lifecycle**
   - Register backend plugin
   - Enable plugin (scheduler tasks registered)
   - Scheduled task executes
   - Disable plugin (tasks unregistered)
   - Unregister plugin

2. **IMAP → Local Images Integration**
   - IMAP downloads image
   - Image appears in LocalImagePlugin
   - Image can be viewed in slideshow
   - Image sorting works correctly

3. **Event System Integration**
   - Image uploaded via LocalImagePlugin
   - Event emitted
   - Backend plugin receives event
   - Plugin processes event

### E2E Tests

1. **Full IMAP Workflow**
   - Configure IMAP backend plugin
   - Enable plugin
   - Wait for scheduled task to run
   - Verify images appear in local images
   - View images in slideshow

2. **Manual Task Trigger**
   - Configure IMAP backend plugin
   - Trigger task manually via API
   - Verify images downloaded
   - Verify status returned

3. **Migration**
   - Create IMAP ImagePlugin instance
   - Run migration script
   - Verify instance converted to BackendPlugin
   - Verify functionality still works

---

## Risks and Mitigations

### Risk 1: Breaking Existing IMAP Installations

**Mitigation**:
- Create migration script
- Test thoroughly on test database
- Provide clear migration instructions
- Keep old code temporarily for rollback

### Risk 2: Scheduler Performance

**Concern**: Too many scheduled tasks could impact performance

**Mitigation**:
- Limit concurrent executions per plugin
- Use async scheduler (already planned)
- Monitor scheduler performance
- Add metrics/logging

### Risk 3: Event System Performance and Scalability

**Concern**: Event system could become a bottleneck or need external queue framework

**Mitigation**:
- **Start Simple**: Use asyncio-based implementation (no external dependencies)
- **Fire-and-Forget by Default**: Non-blocking event delivery (default pattern)
- **Rate Limiting**: Built-in rate limiting per plugin per event type (10 events/second default)
- **Error Isolation**: One bad handler doesn't crash system or block other handlers
- **Future-Proof**: Design allows migration to Redis/Celery if needed later
- **Monitor Performance**: Log event processing times, monitor for bottlenecks
- **Scalability Considerations**:
  - Current implementation: Good for < 1000 events/second, single process
  - Future migration path: Abstract event system interface, add Redis backend if needed
  - No Redis dependency required initially

**When to Consider Redis/External Queue**:
- Event volume > 1000 events/second (asyncio may become bottleneck)
- Multi-process/multi-instance deployment (need cross-process events)
- Event persistence required (need to persist/replay events)
- Guaranteed delivery required (need ACK/retry mechanisms)
- Event ordering required (strict ordering guarantees)
- Event replay required (replay events after plugin restart)
- Distributed systems (multiple Calvin instances need event sharing)

**Decision**: Start with asyncio-based implementation. Migrate to Redis only if/when actual usage patterns require it.

### Risk 4: Event System Complexity

**Concern**: Event system could become complex/unmanageable

**Mitigation**:
- Keep event types well-defined
- Document event contracts
- Use typed event data
- Limit event types initially
- Error isolation (bad handlers don't crash system)
- Rate limiting (prevent event storms)

### Risk 5: Plugin-to-Plugin Dependencies

**Concern**: Backend plugins depending on other plugins could cause issues

**Mitigation**:
- Keep dependencies minimal
- Use service discovery pattern (`provide_service`, `get_provided_services`)
- Document dependencies clearly
- Handle missing dependencies gracefully

### Risk 6: Frontend Complexity

**Concern**: Backend plugins might not need UI, but we need to display them somehow

**Mitigation**:
- Minimal UI for backend plugins
- Configuration-only UI (no display component)
- Clear indication these are "backend" plugins
- Hide complexity from users

### Risk 7: Testing Coverage

**Concern**: Complex system might be hard to test thoroughly

**Mitigation**:
- Comprehensive unit tests
- Integration tests for key workflows
- E2E tests for critical paths
- Test migration script thoroughly

---

## Success Criteria

1. ✅ **Backend plugin type is implemented and functional** - COMPLETED
2. ✅ **IMAP plugin converted to backend plugin** - COMPLETED (moved to calvin-plugins)
3. ✅ **IMAP downloads images to local directory (works with LocalImagePlugin)** - COMPLETED
4. ✅ **Scheduled tasks work correctly** - COMPLETED
5. ⏸️ **Event system works** - DEFERRED (Phase 3)
6. ✅ **Migration script successfully converts old IMAP instances** - COMPLETED (Alembic migration)
7. ✅ **Frontend displays backend plugins appropriately** - COMPLETED
8. ✅ **All tests pass (unit, integration, E2E)** - COMPLETED
9. ✅ **Documentation is complete** - COMPLETED
10. ✅ **No regressions in existing functionality** - COMPLETED
11. ✅ **Dedicated instance update API route** - COMPLETED
12. ✅ **Simplified plugin type update route** - COMPLETED

---

## Timeline

- ✅ **Days 1-2**: Core infrastructure (Phase 1) - **COMPLETED**
- ✅ **Days 3-4**: Scheduler infrastructure (Phase 2) - **COMPLETED**
- ⏸️ **Days 5-6**: Event system (Phase 3) - **DEFERRED**
- ✅ **Day 7**: Database and API updates (Phase 4) - **COMPLETED**
- ✅ **Days 8-9**: Convert IMAP plugin (Phase 5) - **COMPLETED**
- ✅ **Day 10**: Frontend updates (Phase 6) - **COMPLETED**
- ✅ **Days 11-12**: Testing and documentation (Phase 7) - **COMPLETED**
- ✅ **Day 13**: Cleanup and polish (Phase 8) - **COMPLETED**

**Total**: ~11 days (event system deferred, as planned)

---

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 (Core Infrastructure)
3. Implement incrementally, test as we go
4. Regular check-ins to review progress
5. Adjust plan as needed based on learnings

---

## Questions and Decisions Needed

1. **Event System**: Should we implement event system in Phase 3, or defer to later?
   - Recommendation: Defer to keep initial implementation simpler

2. **Service Provider Pattern**: Should we implement `provide_service()` in initial version, or defer?
   - Recommendation: Implement, it's simple and useful

3. **Cron Support**: Should we support cron expressions in initial version?
   - Recommendation: Yes, APScheduler supports it easily

4. **Migration Strategy**: Auto-migrate on startup, or require manual migration?
   - Recommendation: Auto-migrate with logging

5. **UI Complexity**: How much UI do backend plugins need?
   - Recommendation: Minimal - config form + manual trigger button

6. **Event System Architecture**: Should we use Redis/external queue framework from the start?
   - **Recommendation**: NO - Start with asyncio-based implementation
   - **Rationale**: 
     - No external dependencies (simpler deployment)
     - Good enough for initial use cases (< 1000 events/second)
     - Design allows migration to Redis later if needed
     - Fire-and-forget pattern is non-blocking
     - Rate limiting prevents event storms
     - Error isolation prevents system crashes
   - **When to Add Redis**: Only if actual usage patterns require it (high volume, multi-process, persistence needs)

---

## References

- Current plugin architecture: `backend/app/plugins/`
- IMAP plugin: `backend/app/plugins/image/imap.py`
- Scheduler: `backend/app/services/scheduler.py`
- Database models: `backend/app/models/db_models.py`
- Plugin API: `backend/app/api/routes/plugins/`

---

**Last Updated**: 2026-01-11
**Author**: AI Assistant
**Status**: ✅ **IMPLEMENTATION COMPLETE** (Event system deferred to future phase)

## Implementation Summary

### Completed Phases

✅ **Phase 1: Core Infrastructure** - Backend plugin type, protocol, manager, loader
✅ **Phase 2: Scheduler Infrastructure** - BackendPluginScheduler service, integration
⏸️ **Phase 3: Event System** - Deferred to future phase
✅ **Phase 4: Database and API Updates** - API routes, instance management, simplified update route
✅ **Phase 5: Convert IMAP Plugin** - New IMAP backend plugin in calvin-plugins, migration script
✅ **Phase 6: Frontend Updates** - Backend tab, plugin display, instance management
✅ **Phase 7: Testing and Documentation** - Comprehensive test coverage (unit, integration, E2E)
✅ **Phase 8: Cleanup and Polish** - Code review, refactoring, linting fixes

### Key Achievements

1. **Simplified Architecture**: Removed duplicate enabled state setting, single session/commit pattern
2. **Dedicated Instance Management**: New `/plugins/instances/{instance_id}` route for instance updates
3. **Comprehensive Testing**: Full test coverage across backend and frontend
4. **IMAP Migration**: Alembic migration script for existing installations
5. **Plugin Relocation**: IMAP plugin moved to calvin-plugins repository
6. **Frontend Integration**: Complete UI support for backend plugins

### Remaining Work

⏸️ **Event System** (Phase 3): Deferred to future phase when needed
⏸️ **Backend Plugin Actions Endpoint**: Can be added later if manual task triggering is needed
