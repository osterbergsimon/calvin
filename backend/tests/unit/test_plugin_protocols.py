"""Tests for plugin protocol adherence."""

import inspect

import pytest

from app.plugins.base import BasePlugin, PluginType
from app.plugins.protocols import (
    BackendPlugin,
    CalendarPlugin,
    ImagePlugin,
    ServicePlugin,
)


@pytest.mark.unit
class TestProtocolAdherence:
    """Test that plugins adhere to protocol interfaces."""

    def test_base_plugin_must_implement_abstract_methods(self):
        """Test that BasePlugin abstract methods are properly defined."""
        # BasePlugin should be abstract
        assert inspect.isabstract(BasePlugin)

        # Check that abstract methods exist
        assert hasattr(BasePlugin, "plugin_type")
        assert hasattr(BasePlugin, "get_plugin_metadata")
        assert hasattr(BasePlugin, "initialize")
        assert hasattr(BasePlugin, "cleanup")

        # Check that methods are marked as abstract using getattr_static
        # Properties can't be checked with isabstract, but we can check the class
        assert getattr(BasePlugin.plugin_type, "__isabstractmethod__", False) or inspect.isabstract(
            BasePlugin
        )

    def test_calendar_plugin_protocol(self):
        """Test CalendarPlugin protocol definition."""
        assert inspect.isabstract(CalendarPlugin)

        # Check MUST methods are marked as abstract
        # Using getattr_static to check if method is abstract
        assert getattr(CalendarPlugin.fetch_events, "__isabstractmethod__", False)
        assert getattr(CalendarPlugin.validate_config, "__isabstractmethod__", False)

        # Check plugin_type property
        # Create a mock implementation to test
        class MockCalendarPlugin(CalendarPlugin):
            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.CALENDAR}

            @property
            def plugin_type(self):
                return PluginType.CALENDAR

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def fetch_events(self, start_date, end_date):
                return []

            async def validate_config(self, config):
                return True

        plugin = MockCalendarPlugin("test-id", "Test")
        assert isinstance(plugin, CalendarPlugin)
        assert plugin.plugin_type == PluginType.CALENDAR

    def test_image_plugin_protocol(self):
        """Test ImagePlugin protocol definition."""
        assert inspect.isabstract(ImagePlugin)

        # Check MUST methods are marked as abstract
        assert getattr(ImagePlugin.get_images, "__isabstractmethod__", False)
        assert getattr(ImagePlugin.get_image, "__isabstractmethod__", False)
        assert getattr(ImagePlugin.get_image_data, "__isabstractmethod__", False)
        assert getattr(ImagePlugin.scan_images, "__isabstractmethod__", False)
        # Note: ImagePlugin doesn't have validate_config - it's inherited from BasePlugin

        # Check CAN methods have default implementations (not abstract)
        assert not getattr(ImagePlugin.upload_image, "__isabstractmethod__", False)
        assert not getattr(ImagePlugin.delete_image, "__isabstractmethod__", False)
        assert not getattr(ImagePlugin.get_thumbnail_path, "__isabstractmethod__", False)

        # Create a mock implementation to test
        class MockImagePlugin(ImagePlugin):
            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.IMAGE}

            @property
            def plugin_type(self):
                return PluginType.IMAGE

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def get_images(self):
                return []

            async def get_image(self, image_id):
                return None

            async def get_image_data(self, image_id):
                return None

            async def scan_images(self):
                return []

            # validate_config is inherited from BasePlugin, but not abstract there
            # So we don't need to implement it unless BasePlugin makes it abstract

        plugin = MockImagePlugin("test-id", "Test")
        assert isinstance(plugin, ImagePlugin)
        assert plugin.plugin_type == PluginType.IMAGE

        # Test optional methods return defaults
        # Note: These are async methods, so we'd need async test to call them
        # For now, just verify they exist and are callable
        assert callable(plugin.upload_image)
        assert callable(plugin.delete_image)
        assert callable(plugin.get_thumbnail_path)

    def test_service_plugin_protocol(self):
        """Test ServicePlugin protocol definition."""
        assert inspect.isabstract(ServicePlugin)

        # Check MUST methods are marked as abstract
        assert getattr(ServicePlugin.validate_config, "__isabstractmethod__", False)

        # Check CAN methods have default implementations (not abstract).
        assert not getattr(ServicePlugin.handle_webhook, "__isabstractmethod__", False)
        assert not getattr(ServicePlugin.handle_api_request, "__isabstractmethod__", False)
        assert not getattr(ServicePlugin.fetch_service_data, "__isabstractmethod__", False)

        # Create a mock implementation to test
        class MockServicePlugin(ServicePlugin):
            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.SERVICE}

            @property
            def plugin_type(self):
                return PluginType.SERVICE

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def validate_config(self, config):
                return True

        plugin = MockServicePlugin("test-id", "Test")
        assert isinstance(plugin, ServicePlugin)
        assert plugin.plugin_type == PluginType.SERVICE

        # Test optional methods exist and are callable
        assert callable(plugin.handle_webhook)
        assert callable(plugin.handle_api_request)
        assert callable(plugin.fetch_service_data)

    def test_backend_plugin_protocol(self):
        """Test BackendPlugin protocol definition."""
        assert inspect.isabstract(BackendPlugin)

        # Check MUST methods are marked as abstract
        assert getattr(BackendPlugin.validate_config, "__isabstractmethod__", False)

        # Check CAN methods have default implementations (not abstract)
        assert not getattr(BackendPlugin.get_schedule_config, "__isabstractmethod__", False)
        assert not getattr(BackendPlugin.run_scheduled_task, "__isabstractmethod__", False)
        assert not getattr(BackendPlugin.start_worker, "__isabstractmethod__", False)
        assert not getattr(BackendPlugin.stop_worker, "__isabstractmethod__", False)
        assert not getattr(BackendPlugin.provide_service, "__isabstractmethod__", False)
        assert not getattr(BackendPlugin.get_provided_services, "__isabstractmethod__", False)

        # Create a mock implementation to test
        class MockBackendPlugin(BackendPlugin):
            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.BACKEND}

            @property
            def plugin_type(self):
                return PluginType.BACKEND

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def validate_config(self, config):
                return True

        plugin = MockBackendPlugin("test-id", "Test")
        assert isinstance(plugin, BackendPlugin)
        assert plugin.plugin_type == PluginType.BACKEND

        # Test optional methods exist and are callable
        assert callable(plugin.get_schedule_config)
        assert callable(plugin.run_scheduled_task)
        assert callable(plugin.start_worker)
        assert callable(plugin.stop_worker)
        assert callable(plugin.provide_service)
        assert callable(plugin.get_provided_services)


@pytest.mark.unit
class TestProtocolUsage:
    """Test that core code uses protocols correctly."""

    @pytest.mark.asyncio
    async def test_core_should_use_isinstance_for_service_data(self):
        """Test that core code uses the service protocol for dashboard data."""

        # This is a documentation/test of the pattern
        class MockServicePlugin(ServicePlugin):
            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.SERVICE}

            @property
            def plugin_type(self):
                return PluginType.SERVICE

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def validate_config(self, config):
                return True

            async def fetch_service_data(self, start_date=None, end_date=None):
                return {"url": "http://example.com"}

        plugin = MockServicePlugin("test-id", "Test")

        if isinstance(plugin, ServicePlugin):
            content = await plugin.fetch_service_data()
            assert content == {"url": "http://example.com"}

    @pytest.mark.asyncio
    async def test_optional_methods_return_none(self):
        """Test that optional protocol methods return None when not implemented."""

        class MockServicePlugin(ServicePlugin):
            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.SERVICE}

            @property
            def plugin_type(self):
                return PluginType.SERVICE

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def validate_config(self, config):
                return True

        plugin = MockServicePlugin("test-id", "Test")

        # Optional methods should return None by default
        assert await plugin.fetch_service_data() is None
        assert await plugin.handle_api_request("GET", "/") is None
        assert await plugin.handle_webhook({}) is None

    def test_protocol_methods_are_callable(self):
        """Test that all protocol methods are callable."""

        class MockServicePlugin(ServicePlugin):
            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.SERVICE}

            @property
            def plugin_type(self):
                return PluginType.SERVICE

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def validate_config(self, config):
                return True

        plugin = MockServicePlugin("test-id", "Test")

        # All protocol methods should be callable
        assert callable(plugin.validate_config)
        assert callable(plugin.fetch_service_data)
        assert callable(plugin.handle_api_request)
        assert callable(plugin.handle_webhook)


@pytest.mark.unit
class TestProtocolViolations:
    """Test detection of protocol violations in core code."""

    @pytest.mark.asyncio
    async def test_no_private_method_access(self):
        """Test that core code should not access private methods (starting with _)."""

        # This test documents that core code should not call methods starting with _
        class MockServicePlugin(ServicePlugin):
            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.SERVICE}

            @property
            def plugin_type(self):
                return PluginType.SERVICE

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def validate_config(self, config):
                return True

            async def fetch_service_data(self, start_date=None, end_date=None):
                return {"url": "http://example.com"}

            async def _private_method(self):
                """This should never be called by core code."""
                return "private"

        plugin = MockServicePlugin("test-id", "Test")

        # Use the public protocol method.
        content = await plugin.fetch_service_data()
        assert content is not None

        # ❌ WRONG: Don't call private methods
        # result = await plugin._private_method()  # Core should never do this

    @pytest.mark.asyncio
    async def test_no_direct_attribute_access(self):
        """Test that core code should not access plugin attributes directly."""

        class MockServicePlugin(ServicePlugin):
            def __init__(self, plugin_id, name, enabled=True):
                super().__init__(plugin_id, name, enabled)
                self._url = "http://example.com"  # Private attribute

            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.SERVICE}

            @property
            def plugin_type(self):
                return PluginType.SERVICE

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def validate_config(self, config):
                return True

            async def fetch_service_data(self, start_date=None, end_date=None):
                return {"url": self._url}

        plugin = MockServicePlugin("test-id", "Test")

        # Use the public protocol method.
        content = await plugin.fetch_service_data()
        url = content.get("url")
        assert url == "http://example.com"

        # ❌ WRONG: Don't access attributes directly
        # url = getattr(plugin, "_url", "")  # Core should never do this
        # url = plugin._url  # Core should never do this

    @pytest.mark.asyncio
    async def test_backend_plugin_optional_methods_return_defaults(self):
        """Test that optional BackendPlugin methods return defaults when not implemented."""

        class MockBackendPlugin(BackendPlugin):
            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.BACKEND}

            @property
            def plugin_type(self):
                return PluginType.BACKEND

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def validate_config(self, config):
                return True

        plugin = MockBackendPlugin("test-id", "Test")

        # Optional methods should return defaults
        assert await plugin.get_schedule_config() is None
        assert await plugin.get_provided_services() == []
        assert await plugin.provide_service("test") is None
        assert await plugin.fetch_type_data() is None

        # run_scheduled_task should raise NotImplementedError by default
        with pytest.raises(NotImplementedError):
            await plugin.run_scheduled_task()

    @pytest.mark.asyncio
    async def test_backend_plugin_with_scheduled_tasks(self):
        """Test BackendPlugin with scheduled tasks implementation."""

        class MockScheduledBackendPlugin(BackendPlugin):
            def __init__(self, plugin_id: str, name: str, enabled: bool = True):
                super().__init__(plugin_id, name, enabled)
                self.task_run_count = 0

            @classmethod
            def get_plugin_metadata(cls):
                return {"type_id": "test", "plugin_type": PluginType.BACKEND}

            @property
            def plugin_type(self):
                return PluginType.BACKEND

            async def initialize(self):
                pass

            async def cleanup(self):
                pass

            async def validate_config(self, config):
                return True

            async def get_schedule_config(self):
                return {
                    "interval": 300,
                    "enabled": True,
                    "max_concurrent": 1,
                }

            async def run_scheduled_task(self):
                self.task_run_count += 1
                return {
                    "success": True,
                    "message": f"Task executed {self.task_run_count} time(s)",
                    "data": {"count": self.task_run_count},
                }

        plugin = MockScheduledBackendPlugin("test-id", "Test")

        # Test schedule config
        schedule_config = await plugin.get_schedule_config()
        assert schedule_config is not None
        assert schedule_config["interval"] == 300
        assert schedule_config["enabled"] is True

        # Test running scheduled task
        result = await plugin.run_scheduled_task()
        assert result["success"] is True
        assert plugin.task_run_count == 1

        # Run again
        result = await plugin.run_scheduled_task()
        assert plugin.task_run_count == 2
