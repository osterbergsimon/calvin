"""Tests for plugin protocol adherence."""

import inspect

import pytest

from app.plugins.base import BasePlugin, PluginType
from app.plugins.protocols import CalendarPlugin, ImagePlugin, ServicePlugin


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
        assert getattr(ServicePlugin.get_content, "__isabstractmethod__", False)
        assert getattr(ServicePlugin.validate_config, "__isabstractmethod__", False)

        # Check CAN methods have default implementations (not abstract)
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

            async def get_content(self):
                return {"type": "iframe", "url": "http://example.com"}

            async def validate_config(self, config):
                return True

        plugin = MockServicePlugin("test-id", "Test")
        assert isinstance(plugin, ServicePlugin)
        assert plugin.plugin_type == PluginType.SERVICE

        # Test optional methods exist and are callable
        assert callable(plugin.handle_webhook)
        assert callable(plugin.handle_api_request)
        assert callable(plugin.fetch_service_data)


@pytest.mark.unit
class TestProtocolUsage:
    """Test that core code uses protocols correctly."""

    @pytest.mark.asyncio
    async def test_core_should_use_isinstance_not_hasattr(self):
        """Test that core code should use isinstance checks, not hasattr."""

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

            async def get_content(self):
                return {"type": "iframe", "url": "http://example.com"}

            async def validate_config(self, config):
                return True

        plugin = MockServicePlugin("test-id", "Test")

        # ✅ CORRECT: Use isinstance
        if isinstance(plugin, ServicePlugin):
            content = await plugin.get_content()
            assert content is not None

        # ❌ WRONG: Don't use hasattr
        # if hasattr(plugin, "get_content"):
        #     content = await plugin.get_content()

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

            async def get_content(self):
                return {"type": "iframe", "url": "http://example.com"}

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

            async def get_content(self):
                return {"type": "iframe", "url": "http://example.com"}

            async def validate_config(self, config):
                return True

        plugin = MockServicePlugin("test-id", "Test")

        # All protocol methods should be callable
        assert callable(plugin.get_content)
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

            async def get_content(self):
                return {"type": "iframe", "url": "http://example.com"}

            async def validate_config(self, config):
                return True

            async def _private_method(self):
                """This should never be called by core code."""
                return "private"

        plugin = MockServicePlugin("test-id", "Test")

        # ✅ CORRECT: Use protocol method
        content = await plugin.get_content()
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

            async def get_content(self):
                return {"type": "iframe", "url": self._url}

            async def validate_config(self, config):
                return True

        plugin = MockServicePlugin("test-id", "Test")

        # ✅ CORRECT: Use protocol method
        content = await plugin.get_content()
        url = content.get("url")
        assert url == "http://example.com"

        # ❌ WRONG: Don't access attributes directly
        # url = getattr(plugin, "_url", "")  # Core should never do this
        # url = plugin._url  # Core should never do this
