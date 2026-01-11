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

### Future System Events

- `plugin_enabled`: When a plugin is enabled
- `plugin_disabled`: When a plugin is disabled
- `config_changed`: When system configuration changes

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

### Subscribing to Events

```python
class MyBackendPlugin(BackendPlugin):
    async def get_subscribed_events(self) -> list[str]:
        """Subscribe to image_uploaded events."""
        return ["image_uploaded"]
    
    async def handle_event(
        self, event_type: str, event_data: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Handle image_uploaded events."""
        if event_type == "image_uploaded":
            image_id = event_data["image_id"]
            filename = event_data["filename"]
            # Process the image...
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

## Event Flow Example: IMAP → Image Processor

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
