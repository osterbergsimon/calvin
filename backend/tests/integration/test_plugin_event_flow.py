"""Integration tests for plugin-to-plugin event communication."""

import asyncio
import tempfile
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from app.plugins.base import PluginType
from app.plugins.manager import plugin_manager
from app.plugins.protocols import BackendPlugin
from app.services.event_system import event_system


def create_test_image(path: Path, width: int = 100, height: int = 100) -> None:
    """Create a valid test image file."""
    img = Image.new("RGB", (width, height), color="red")
    img.save(path, "JPEG")


class MockImageProcessorPlugin(BackendPlugin):
    """Mock ImageProcessorPlugin that subscribes to image_uploaded events."""

    def __init__(
        self,
        plugin_id: str,
        name: str,
        enabled: bool = True,
    ):
        super().__init__(plugin_id, name, enabled)
        self._received_events = []
        self._processed_count = 0

    @classmethod
    def get_plugin_metadata(cls):
        return {"type_id": "image-processor", "plugin_type": PluginType.BACKEND}

    @property
    def plugin_type(self) -> PluginType:
        return PluginType.BACKEND

    async def initialize(self) -> None:
        pass

    async def cleanup(self) -> None:
        pass

    async def validate_config(self, config: dict[str, Any]) -> bool:
        return True

    async def get_subscribed_events(self) -> list[str]:
        return ["image_uploaded"]

    async def handle_event(
        self, event_type: str, event_data: dict[str, Any]
    ) -> dict[str, Any] | None:
        self._received_events.append((event_type, event_data))
        self._processed_count += 1

        # Emit image_processed event (simulating processing)
        await self.emit_event(
            "image_processed",
            {
                "image_id": event_data["image_id"],
                "filename": event_data["filename"],
                "processor_id": self.plugin_id,
                "processing_results": {"resized": True, "thumbnail_generated": True},
            },
            wait_for_handlers=False,
        )

        return {"success": True, "processed": True}

    def get_received_events(self) -> list[tuple[str, dict[str, Any]]]:
        """Get list of received events for testing."""
        return self._received_events.copy()

    def get_processed_count(self) -> int:
        """Get number of processed images."""
        return self._processed_count


class MockEventLoggerPlugin(BackendPlugin):
    """Mock plugin that subscribes to image_processed events."""

    def __init__(
        self,
        plugin_id: str,
        name: str,
        enabled: bool = True,
    ):
        super().__init__(plugin_id, name, enabled)
        self._logged_events = []

    @classmethod
    def get_plugin_metadata(cls):
        return {"type_id": "event-logger", "plugin_type": PluginType.BACKEND}

    @property
    def plugin_type(self) -> PluginType:
        return PluginType.BACKEND

    async def initialize(self) -> None:
        pass

    async def cleanup(self) -> None:
        pass

    async def validate_config(self, config: dict[str, Any]) -> bool:
        return True

    async def get_subscribed_events(self) -> list[str]:
        return ["image_processed"]

    async def handle_event(
        self, event_type: str, event_data: dict[str, Any]
    ) -> dict[str, Any] | None:
        self._logged_events.append((event_type, event_data))
        return {"logged": True}

    def get_logged_events(self) -> list[tuple[str, dict[str, Any]]]:
        """Get list of logged events for testing."""
        return self._logged_events.copy()


@pytest.mark.asyncio
async def test_imap_download_triggers_image_processor():
    """Test that IMAP downloading an image triggers ImageProcessor via events."""
    from app.plugins.image.local import LocalImagePlugin

    # Create temporary image directory
    with tempfile.TemporaryDirectory() as temp_dir:
        image_dir = Path(temp_dir) / "images"
        image_dir.mkdir(parents=True, exist_ok=True)

        # Create LocalImagePlugin
        local_plugin = LocalImagePlugin(
            plugin_id="local-images",
            name="Local Images",
            enabled=True,
        )
        await local_plugin.configure({"image_dir": str(image_dir)})
        await local_plugin.initialize()

        # Create ImageProcessorPlugin
        processor_plugin = MockImageProcessorPlugin(
            "image-processor-1",
            "Image Processor",
            enabled=True,
        )

        # Register both plugins
        await plugin_manager.register(local_plugin)
        await plugin_manager.register(processor_plugin)

        # Wait for subscriptions to complete
        await asyncio.sleep(0.1)

        try:
            # Simulate IMAP downloading an image (create a valid image file)
            test_image_path = image_dir / "test_image.jpg"
            create_test_image(test_image_path)

            # LocalImagePlugin scans and detects new image
            # This should emit image_uploaded event
            await local_plugin.scan_images()

            # Wait for event processing
            await asyncio.sleep(0.2)

            # Verify ImageProcessor received the event
            received = processor_plugin.get_received_events()
            assert len(received) == 1, f"Expected 1 event, got {len(received)}"
            assert received[0][0] == "image_uploaded"
            assert received[0][1]["filename"] == "test_image.jpg"
            assert processor_plugin.get_processed_count() == 1

        finally:
            # Cleanup
            await plugin_manager.unregister("local-images")
            await plugin_manager.unregister("image-processor-1")


@pytest.mark.asyncio
async def test_image_processor_emits_processed_event():
    """Test that ImageProcessor emits image_processed events."""
    # Create ImageProcessorPlugin
    processor_plugin = MockImageProcessorPlugin(
        "image-processor-2",
        "Image Processor",
        enabled=True,
    )

    # Create EventLoggerPlugin that subscribes to image_processed
    logger_plugin = MockEventLoggerPlugin(
        "event-logger-1",
        "Event Logger",
        enabled=True,
    )

    # Register both plugins
    await plugin_manager.register(processor_plugin)
    await plugin_manager.register(logger_plugin)

    # Wait for subscriptions
    await asyncio.sleep(0.1)

    try:
        # Simulate image_uploaded event (as if from LocalImagePlugin)
        await event_system.emit_event(
            "image_uploaded",
            {
                "image_id": "test-123",
                "filename": "test.jpg",
                "path": "/path/to/test.jpg",
                "plugin_id": "local-images",
            },
            wait_for_handlers=False,
        )

        # Wait for event processing
        await asyncio.sleep(0.2)

        # Verify ImageProcessor received image_uploaded
        processor_events = processor_plugin.get_received_events()
        assert len(processor_events) == 1
        assert processor_events[0][0] == "image_uploaded"

        # Verify EventLogger received image_processed (emitted by ImageProcessor)
        logger_events = logger_plugin.get_logged_events()
        assert len(logger_events) == 1
        assert logger_events[0][0] == "image_processed"
        assert logger_events[0][1]["image_id"] == "test-123"
        assert logger_events[0][1]["processor_id"] == "image-processor-2"

    finally:
        # Cleanup
        await plugin_manager.unregister("image-processor-2")
        await plugin_manager.unregister("event-logger-1")


@pytest.mark.asyncio
async def test_full_event_chain_imap_to_processor_to_logger():
    """Test full event chain: IMAP download → image_uploaded → image_processed."""
    from app.plugins.image.local import LocalImagePlugin

    # Create temporary image directory
    with tempfile.TemporaryDirectory() as temp_dir:
        image_dir = Path(temp_dir) / "images"
        image_dir.mkdir(parents=True, exist_ok=True)

        # Create LocalImagePlugin
        local_plugin = LocalImagePlugin(
            plugin_id="local-images",
            name="Local Images",
            enabled=True,
        )
        await local_plugin.configure({"image_dir": str(image_dir)})
        await local_plugin.initialize()

        # Create ImageProcessorPlugin
        processor_plugin = MockImageProcessorPlugin(
            "image-processor-3",
            "Image Processor",
            enabled=True,
        )

        # Create EventLoggerPlugin
        logger_plugin = MockEventLoggerPlugin(
            "event-logger-2",
            "Event Logger",
            enabled=True,
        )

        # Register all plugins
        await plugin_manager.register(local_plugin)
        await plugin_manager.register(processor_plugin)
        await plugin_manager.register(logger_plugin)

        # Wait for subscriptions
        await asyncio.sleep(0.1)

        try:
            # Step 1: Simulate IMAP downloading an image (create a valid image file)
            test_image_path = image_dir / "imap_downloaded_image.jpg"
            create_test_image(test_image_path)

            # Step 2: LocalImagePlugin scans and detects new image
            # This emits image_uploaded event
            await local_plugin.scan_images()

            # Wait for all events to propagate
            await asyncio.sleep(0.3)

            # Step 3: Verify ImageProcessor received image_uploaded
            processor_events = processor_plugin.get_received_events()
            assert len(processor_events) == 1
            assert processor_events[0][0] == "image_uploaded"
            assert "imap_downloaded_image.jpg" in processor_events[0][1]["filename"]

            # Step 4: Verify EventLogger received image_processed (from ImageProcessor)
            logger_events = logger_plugin.get_logged_events()
            assert len(logger_events) == 1
            assert logger_events[0][0] == "image_processed"
            assert logger_events[0][1]["processor_id"] == "image-processor-3"
            assert logger_events[0][1]["processing_results"]["resized"] is True

        finally:
            # Cleanup
            await plugin_manager.unregister("local-images")
            await plugin_manager.unregister("image-processor-3")
            await plugin_manager.unregister("event-logger-2")


@pytest.mark.asyncio
async def test_multiple_processors_receive_same_event():
    """Test that multiple plugins can subscribe to the same event."""
    # Create two ImageProcessor plugins
    processor1 = MockImageProcessorPlugin("processor-1", "Processor 1", enabled=True)
    processor2 = MockImageProcessorPlugin("processor-2", "Processor 2", enabled=True)

    # Register both
    await plugin_manager.register(processor1)
    await plugin_manager.register(processor2)

    # Wait for subscriptions
    await asyncio.sleep(0.1)

    try:
        # Emit image_uploaded event
        await event_system.emit_event(
            "image_uploaded",
            {
                "image_id": "test-456",
                "filename": "test.jpg",
                "path": "/path/to/test.jpg",
                "plugin_id": "local-images",
            },
            wait_for_handlers=False,
        )

        # Wait for processing
        await asyncio.sleep(0.2)

        # Both processors should have received the event
        events1 = processor1.get_received_events()
        events2 = processor2.get_received_events()

        assert len(events1) == 1
        assert len(events2) == 1
        assert events1[0][0] == "image_uploaded"
        assert events2[0][0] == "image_uploaded"

    finally:
        await plugin_manager.unregister("processor-1")
        await plugin_manager.unregister("processor-2")


@pytest.mark.asyncio
async def test_plugin_emits_custom_event():
    """Test that plugins can emit custom events that other plugins receive."""

    # Create a plugin that emits custom events
    class CustomEventEmitterPlugin(BackendPlugin):
        def __init__(self, plugin_id: str, name: str, enabled: bool = True):
            super().__init__(plugin_id, name, enabled)
            self._emitted_count = 0

        @classmethod
        def get_plugin_metadata(cls):
            return {"type_id": "custom-emitter", "plugin_type": PluginType.BACKEND}

        @property
        def plugin_type(self) -> PluginType:
            return PluginType.BACKEND

        async def initialize(self) -> None:
            pass

        async def cleanup(self) -> None:
            pass

        async def validate_config(self, config: dict[str, Any]) -> bool:
            return True

        async def emit_custom_event(self, data: dict[str, Any]) -> None:
            """Emit a custom event."""
            await self.emit_event("custom_data_ready", data, wait_for_handlers=False)
            self._emitted_count += 1

    # Create a plugin that subscribes to custom events
    class CustomEventSubscriberPlugin(BackendPlugin):
        def __init__(self, plugin_id: str, name: str, enabled: bool = True):
            super().__init__(plugin_id, name, enabled)
            self._received_custom_events = []

        @classmethod
        def get_plugin_metadata(cls):
            return {"type_id": "custom-subscriber", "plugin_type": PluginType.BACKEND}

        @property
        def plugin_type(self) -> PluginType:
            return PluginType.BACKEND

        async def initialize(self) -> None:
            pass

        async def cleanup(self) -> None:
            pass

        async def validate_config(self, config: dict[str, Any]) -> bool:
            return True

        async def get_subscribed_events(self) -> list[str]:
            return ["custom_data_ready"]

        async def handle_event(
            self, event_type: str, event_data: dict[str, Any]
        ) -> dict[str, Any] | None:
            self._received_custom_events.append((event_type, event_data))
            return {"handled": True}

        def get_received_events(self) -> list[tuple[str, dict[str, Any]]]:
            return self._received_custom_events.copy()

    emitter = CustomEventEmitterPlugin("emitter-1", "Custom Emitter", enabled=True)
    subscriber = CustomEventSubscriberPlugin("subscriber-1", "Custom Subscriber", enabled=True)

    # Register both
    await plugin_manager.register(emitter)
    await plugin_manager.register(subscriber)

    # Wait for subscriptions
    await asyncio.sleep(0.1)

    try:
        # Emit custom event
        await emitter.emit_custom_event({"data": "test", "value": 123})

        # Wait for processing
        await asyncio.sleep(0.2)

        # Verify subscriber received the custom event
        received = subscriber.get_received_events()
        assert len(received) == 1
        assert received[0][0] == "custom_data_ready"
        assert received[0][1]["data"] == "test"
        assert received[0][1]["value"] == 123

    finally:
        await plugin_manager.unregister("emitter-1")
        await plugin_manager.unregister("subscriber-1")
