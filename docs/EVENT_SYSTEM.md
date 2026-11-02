# Event System Documentation

## Overview

The Calvin event system enables plugin-to-plugin communication and system-level event notifications. It uses an asyncio-based, in-memory event system that is lightweight, non-blocking, and requires no external dependencies.

## Architecture

### Design Principles

1. **System-Emitted Events**: Core system emits events for system-level operations
2. **Plugin-Emitted Events**: Plugins can emit custom events for plugin-specific operations
3. **Centralized Detection**: System automatically detects changes (e.g., new images) and emits events
4. **No Duplication**: Plugins don't need to emit system events - the system handles it

### Event Delivery Patterns

- **Fire-and-Forget (default)**: Events emitted asynchronously, handlers run in background, don't wait for results
- **Fire-and-Wait (optional)**: For critical events, wait for all handlers to complete

### Features

- **Non-blocking**: Event emission never blocks the main application
- **Error Isolation**: One bad handler cannot crash the system or block other handlers
- **Rate Limiting**: 10 events/second per plugin per event type (configurable)
- **No External Dependencies**: Pure asyncio implementation

## Event Naming Convention

Calvin distinguishes two namespaces:

- **System-emitted events** use **bare snake_case** names that describe a noun + past-tense
  verb: `image_uploaded`, `plugin_enabled`, `plugin_instance_started`. These are stable
  contracts — the host owns them and won't rename them silently.
- **Plugin-emitted events** must be **prefixed with the emitting plugin's `type_id`**:
  `<plugin_id>.<event_name>`, e.g. `image_processor.image_processed`,
  `mealie.recipe_imported`. The prefix prevents collisions between independently
  developed plugins and makes log/trace output unambiguous.

Subscribers may listen to either namespace. When you emit an event from a plugin, always
include the prefix; when you subscribe, match the exact name.

> **Legacy:** Some early plugins (notably `image-processor`) emit unprefixed events like
> `image_processed` and `image_processing_failed`. New plugins **should** use the
> prefixed form. Existing emitters will be migrated incrementally; subscribers should
> tolerate both during the transition.

## Event Registry

Quick lookup of every event name a plugin author may want to emit or subscribe to. The
detailed schema for each event lives in the section below.

### System-emitted (stable contract)

| Event | Emitted from | Trigger |
|---|---|---|
| `image_uploaded` | `LocalImagePlugin.scan_images()` | New image detected. |
| `image_deleted` | `PluginImageService.delete_image()` | Image removed. |
| `plugin_enabled` | `routes/plugins/management.update_plugin` | Plugin type enabled. |
| `plugin_disabled` | `routes/plugins/management.update_plugin` | Plugin type disabled. |
| `plugin_installed` | `routes/plugins/management.install_plugin` | Plugin installed. |
| `plugin_uninstalled` | `routes/plugins/management.uninstall_plugin` | Plugin uninstalled. |
| `plugin_instance_created` | `routes/plugins/instances.update_plugin_instance` | Instance row created. |
| `plugin_instance_updated` | `routes/plugins/instances.update_plugin_instance` | Instance edited. |
| `plugin_instance_started` | `routes/plugins/instances.start_plugin_instance` | Instance started. |
| `plugin_instance_stopped` | `routes/plugins/instances.stop_plugin_instance` | Instance stopped. |

### Plugin-emitted (example, not exhaustive)

| Event | Emitter | Notes |
|---|---|---|
| `image_processed` | `image-processor` | Legacy unprefixed name; will become `image_processor.image_processed`. |
| `image_processing_failed` | `image-processor` | Same — will become `image_processor.image_processing_failed`. |

If you add a new event in your plugin, add a row here in the same PR so other plugin
authors can find it.

## System-Emitted Events

These events are emitted by the core system automatically:

### `image_uploaded`

**Emitted by**: `LocalImagePlugin.scan_images()` when a new image is detected

**When**: 
- New image file appears in the local images directory
- Works for ANY source: IMAP downloads, manual uploads, file system additions, etc.

**Event Data**:
```python
{
    "image_id": str,      # Unique image identifier
    "filename": str,      # Image filename
    "path": str,          # Full path to image file
    "plugin_id": str      # Plugin ID that detected the image (usually "local-images")
}
```

**Important**: Plugins that download images (like IMAP) don't need to emit this event. The system automatically detects new images during scan and emits the event.

### `image_deleted`

**Emitted by**: `PluginImageService.delete_image()` when an image is deleted

**When**: Image is deleted via the image service

**Event Data**:
```python
{
    "image_id": str,      # Unique image identifier
    "filename": str,      # Image filename
    "plugin_id": str      # Plugin ID that deleted the image
}
```

### `plugin_enabled`

**Emitted by**: `app/api/routes/plugins/management.py::update_plugin()` when a plugin type is enabled

**When**: Plugin type enabled status is set to `true` (via `PUT /plugins/{plugin_id}` with `enabled: true`)

**Event Data**:
```python
{
    "plugin_id": str,        # Plugin type ID
    "plugin_type": str,      # Plugin type (calendar, image, service, theme, etc.)
    "enabled_at": str        # ISO timestamp
}
```

### `plugin_disabled`

**Emitted by**: `app/api/routes/plugins/management.py::update_plugin()` when a plugin type is disabled

**When**: Plugin type enabled status is set to `false` (via `PUT /plugins/{plugin_id}` with `enabled: false`)

**Event Data**:
```python
{
    "plugin_id": str,        # Plugin type ID
    "plugin_type": str,      # Plugin type
    "disabled_at": str       # ISO timestamp
}
```

### `plugin_installed`

**Emitted by**: `app/api/routes/plugins/management.py::install_plugin()` when a plugin is successfully installed

**When**: Plugin is installed via `POST /plugins/install`

**Event Data**:
```python
{
    "plugin_id": str,        # Plugin ID
    "plugin_type": str,      # Plugin type
    "version": str,          # Plugin version
    "installed_at": str      # ISO timestamp
}
```

### `plugin_uninstalled`

**Emitted by**: `app/api/routes/plugins/management.py::uninstall_plugin()` when a plugin is uninstalled

**When**: Plugin is uninstalled via `DELETE /plugins/installed/{plugin_id}`

**Event Data**:
```python
{
    "plugin_id": str,        # Plugin ID
    "plugin_type": str,      # Plugin type
    "uninstalled_at": str    # ISO timestamp
}
```

### `plugin_instance_created`

**Emitted by**: `app/api/routes/plugins/instances.py::update_plugin_instance()` when a plugin instance is created

**When**: Plugin instance is created (when instance doesn't exist and is enabled)

**Event Data**:
```python
{
    "instance_id": str,      # Plugin instance ID
    "plugin_id": str,        # Plugin type ID
    "name": str,             # Instance name
    "created_at": str        # ISO timestamp
}
```

### `plugin_instance_updated`

**Emitted by**: `app/api/routes/plugins/instances.py::update_plugin_instance()` when a plugin instance is updated

**When**: Plugin instance is updated (config, enabled status, or name) via `PUT /plugins/instances/{instance_id}`

**Event Data**:
```python
{
    "instance_id": str,      # Plugin instance ID
    "plugin_id": str,        # Plugin type ID
    "changes": {             # What changed
        "enabled": bool | None,
        "config": dict | None,
        "name": str | None
    },
    "updated_at": str        # ISO timestamp
}
```

### `plugin_instance_started`

**Emitted by**: `app/api/routes/plugins/instances.py::start_plugin_instance()` when a plugin instance starts

**When**: Plugin instance is started via `POST /plugins/instances/{instance_id}/start` or auto-started

**Event Data**:
```python
{
    "instance_id": str,      # Plugin instance ID
    "plugin_id": str,        # Plugin type ID
    "started_at": str        # ISO timestamp
}
```

### `plugin_instance_stopped`

**Emitted by**: `app/api/routes/plugins/instances.py::stop_plugin_instance()` when a plugin instance stops

**When**: Plugin instance is stopped via `POST /plugins/instances/{instance_id}/stop` or auto-stopped

**Event Data**:
```python
{
    "instance_id": str,      # Plugin instance ID
    "plugin_id": str,        # Plugin type ID
    "stopped_at": str        # ISO timestamp
}
```

### Future System Events

- `config_changed`: When system configuration changes
- `scheduled_task_started`: When a scheduled task starts
- `scheduled_task_completed`: When a scheduled task completes
- `scheduled_task_failed`: When a scheduled task fails
- `calendar_events_refreshed`: When calendar events are fetched
- `system_started`: When the system starts up
- `system_shutting_down`: When the system is shutting down

## Plugin-Emitted Events

Plugins can emit custom events for plugin-to-plugin communication:

### Example: `image_processed`

**Emitted by**: ImageProcessorPlugin after processing an image

**Event Data**:
```python
{
    "image_id": str,
    "filename": str,
    "original_path": str,
    "processor_id": str,
    "processing_results": {
        "resized": bool,
        "thumbnail_generated": bool,
        # ... other processing results
    }
}
```

### Example: `sync_completed`

**Emitted by**: A sync plugin after completing a sync operation

**Event Data**:
```python
{
    "sync_type": str,
    "items_synced": int,
    "success": bool
}
```

## Usage Examples

### Subscribing to System Events

Plugins can subscribe to system events to react to changes in the application state:

```python
class MyBackendPlugin(BackendPlugin):
    async def get_subscribed_events(self) -> list[str]:
        """Subscribe to multiple system events."""
        return [
            "image_uploaded",
            "plugin_enabled",
            "plugin_installed",
            "plugin_instance_created",
        ]
    
    async def handle_event(
        self, event_type: str, event_data: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Handle various system events."""
        if event_type == "image_uploaded":
            image_id = event_data["image_id"]
            filename = event_data["filename"]
            # Process the image...
            return {"success": True}
        
        elif event_type == "plugin_enabled":
            plugin_id = event_data["plugin_id"]
            plugin_type = event_data["plugin_type"]
            # React to plugin being enabled...
            logger.info(f"Plugin {plugin_id} ({plugin_type}) was enabled")
            return {"success": True}
        
        elif event_type == "plugin_installed":
            plugin_id = event_data["plugin_id"]
            version = event_data["version"]
            # Auto-configure newly installed plugin...
            logger.info(f"Plugin {plugin_id} v{version} was installed")
            return {"success": True}
        
        elif event_type == "plugin_instance_created":
            instance_id = event_data["instance_id"]
            plugin_id = event_data["plugin_id"]
            # React to new instance creation...
            logger.info(f"Instance {instance_id} of plugin {plugin_id} was created")
            return {"success": True}
        
        return None
```

### Emitting Events

```python
class MyBackendPlugin(BackendPlugin):
    async def run_scheduled_task(self):
        # Do some work
        result = process_data()
        
        # Emit custom event (fire-and-forget)
        await self.emit_event(
            "data_processed",
            {"result": result, "timestamp": time.time()},
            wait_for_handlers=False
        )
        
        # Emit critical event (fire-and-wait)
        results = await self.emit_event(
            "critical_data_changed",
            {"key": "config", "value": "new_value"},
            wait_for_handlers=True  # Wait for all handlers
        )
        
        return {"success": True}
```

## Event Flow Examples

### Example 1: IMAP → Image Processor

1. **IMAP Plugin** downloads image from email
   - Saves image to `./data/images/photo.jpg`
   - Does NOT emit any events

2. **LocalImagePlugin** scans directory (periodically or on demand)
   - Detects new image `photo.jpg`
   - Emits `image_uploaded` event (fire-and-forget)

3. **ImageProcessorPlugin** receives event
   - Processes image (resize, optimize, etc.)
   - Emits `image_processed` event (fire-and-forget)

4. **Other Plugins** can subscribe to `image_processed` if needed

### Example 2: Plugin Installation → Auto-Configuration

1. **User** installs a new plugin via `POST /plugins/install`
   - System installs plugin and reloads plugin list

2. **System** emits `plugin_installed` event
   - Event includes plugin_id, plugin_type, version, and timestamp

3. **AutoConfigPlugin** subscribes to `plugin_installed` events
   - Receives the event
   - Automatically configures the new plugin with default settings
   - May emit `plugin_instance_created` if it creates an instance

4. **MonitoringPlugin** also subscribes to `plugin_installed`
   - Logs the installation event for audit purposes

### Example 3: Plugin Instance Lifecycle

1. **User** creates a new plugin instance via `PUT /plugins/instances/{instance_id}`
   - System creates the instance and enables it

2. **System** emits `plugin_instance_created` event
   - Event includes instance_id, plugin_id, name, and timestamp

3. **System** automatically starts the instance
   - Emits `plugin_instance_started` event

4. **CoordinatorPlugin** subscribes to both events
   - When instance is created: Sets up dependencies
   - When instance is started: Starts related services

## Best Practices

1. **Use System Events**: Subscribe to system-emitted events rather than requiring plugins to emit them
2. **Fire-and-Forget Default**: Use fire-and-forget for most events (non-blocking)
3. **Fire-and-Wait for Critical**: Use fire-and-wait only for critical events that need confirmation
4. **Error Handling**: Always handle errors gracefully in event handlers
5. **Rate Limiting**: Be aware of rate limiting (10 events/second per plugin per event type)

## Rate Limiting

The event system automatically rate-limits events to prevent event storms:

- **Default**: 10 events/second per plugin per event type
- **Purpose**: Prevents a single plugin from overwhelming the system
- **Behavior**: If rate limit exceeded, event is silently dropped (logged at debug level)

## Migration from External Queue Frameworks

The current asyncio-based implementation is sufficient for:
- Low-to-medium event volume (< 1000 events/second)
- Single-process applications
- Fire-and-forget event delivery
- In-memory event delivery (no persistence)

Consider Redis/Celery/RQ if you need:
- High event volume (> 1000 events/second)
- Multi-process/multi-instance deployment
- Event persistence
- Guaranteed delivery with ACK/retry
- Event replay capabilities
