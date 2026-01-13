"""Unit tests for keyboard utility."""

from unittest.mock import MagicMock, patch

from app.utils.keyboard import (
    KeyboardHandler,
    MockKeyboardHandler,
    get_keyboard_handler,
)


class TestKeyboardHandler:
    """Test KeyboardHandler class."""

    def test_init_linux_with_evdev(self):
        """Test initialization on Linux with evdev available."""
        with (
            patch("app.utils.keyboard.IS_LINUX", True),
            patch("app.utils.keyboard.EVDEV_AVAILABLE", True),
            patch("app.utils.keyboard.InputDevice") as mock_input_device,
        ):
            mock_device = MagicMock()
            mock_input_device.return_value = mock_device

            handler = KeyboardHandler(device_path="/dev/input/event0")

            assert handler.device_path == "/dev/input/event0"
            assert handler.is_available is True
            assert handler.device == mock_device

    def test_init_linux_auto_detect(self):
        """Test initialization on Linux with auto-detection."""
        with (
            patch("app.utils.keyboard.IS_LINUX", True),
            patch("app.utils.keyboard.EVDEV_AVAILABLE", True),
            patch("app.utils.keyboard.InputDevice") as mock_input_device,
            patch("app.utils.keyboard.ecodes") as mock_ecodes,
            patch("glob.glob") as mock_glob,
        ):
            mock_device = MagicMock()
            mock_ecodes.EV_KEY = 1
            mock_device.capabilities.return_value = {1: []}  # Has EV_KEY
            mock_input_device.return_value = mock_device
            mock_glob.return_value = ["/dev/input/event0", "/dev/input/event1"]

            handler = KeyboardHandler()

            assert handler.is_available is True
            assert handler.device == mock_device

    def test_init_linux_no_evdev(self):
        """Test initialization on Linux without evdev."""
        with (
            patch("app.utils.keyboard.IS_LINUX", True),
            patch("app.utils.keyboard.EVDEV_AVAILABLE", False),
        ):
            handler = KeyboardHandler()

            assert handler.is_available is False
            assert handler.device is None

    def test_init_windows(self):
        """Test initialization on Windows."""
        with (
            patch("app.utils.keyboard.IS_LINUX", False),
            patch("app.utils.keyboard.IS_WINDOWS", True),
        ):
            handler = KeyboardHandler()

            assert handler.is_available is False
            assert handler.device is None

    def test_init_unsupported_platform(self):
        """Test initialization on unsupported platform."""
        with (
            patch("app.utils.keyboard.IS_LINUX", False),
            patch("app.utils.keyboard.IS_WINDOWS", False),
        ):
            handler = KeyboardHandler()

            assert handler.is_available is False
            assert handler.device is None

    def test_auto_detect_keyboard_no_devices(self):
        """Test auto-detection when no devices found."""
        with (
            patch("app.utils.keyboard.IS_LINUX", True),
            patch("app.utils.keyboard.EVDEV_AVAILABLE", True),
            patch("glob.glob") as mock_glob,
        ):
            mock_glob.return_value = []

            handler = KeyboardHandler()

            assert handler.is_available is False
            assert handler.device is None

    def test_auto_detect_keyboard_no_keyboard_capability(self):
        """Test auto-detection when devices don't have keyboard capability."""
        with (
            patch("app.utils.keyboard.IS_LINUX", True),
            patch("app.utils.keyboard.EVDEV_AVAILABLE", True),
            patch("app.utils.keyboard.InputDevice") as mock_input_device,
            patch("glob.glob") as mock_glob,
        ):
            # Device doesn't have EV_KEY capability
            mock_device = MagicMock()
            mock_device.capabilities.return_value = {}  # No EV_KEY
            mock_input_device.return_value = mock_device
            mock_glob.return_value = ["/dev/input/event0"]

            handler = KeyboardHandler()

            assert handler.is_available is False

    def test_read_events_success(self):
        """Test reading keyboard events successfully."""
        with (
            patch("app.utils.keyboard.IS_LINUX", True),
            patch("app.utils.keyboard.EVDEV_AVAILABLE", True),
            patch("app.utils.keyboard.InputDevice") as mock_input_device,
            patch("app.utils.keyboard.ecodes") as mock_ecodes,
        ):
            mock_event1 = MagicMock()
            mock_event1.type = 1  # EV_KEY
            mock_event2 = MagicMock()
            mock_event2.type = 2  # Not EV_KEY
            mock_event3 = MagicMock()
            mock_event3.type = 1  # EV_KEY

            mock_device = MagicMock()
            mock_device.read_loop.return_value = [mock_event1, mock_event2, mock_event3]
            mock_input_device.return_value = mock_device
            mock_ecodes.EV_KEY = 1

            handler = KeyboardHandler(device_path="/dev/input/event0")

            events = list(handler.read_events())

            # Should only return EV_KEY events
            assert len(events) == 2
            assert events[0] == mock_event1
            assert events[1] == mock_event3

    def test_read_events_not_available(self):
        """Test reading events when handler is not available."""
        handler = KeyboardHandler()
        handler.is_available = False

        events = list(handler.read_events())

        assert len(events) == 0

    def test_read_events_error(self):
        """Test handling of errors during event reading."""
        with (
            patch("app.utils.keyboard.IS_LINUX", True),
            patch("app.utils.keyboard.EVDEV_AVAILABLE", True),
            patch("app.utils.keyboard.InputDevice") as mock_input_device,
        ):
            mock_device = MagicMock()
            mock_device.read_loop.side_effect = Exception("Read error")
            mock_input_device.return_value = mock_device

            handler = KeyboardHandler(device_path="/dev/input/event0")

            events = list(handler.read_events())

            # Should return empty list on error
            assert len(events) == 0

    def test_close(self):
        """Test closing the keyboard device."""
        with (
            patch("app.utils.keyboard.IS_LINUX", True),
            patch("app.utils.keyboard.EVDEV_AVAILABLE", True),
            patch("app.utils.keyboard.InputDevice") as mock_input_device,
        ):
            mock_device = MagicMock()
            mock_input_device.return_value = mock_device

            handler = KeyboardHandler(device_path="/dev/input/event0")
            handler.close()

            mock_device.close.assert_called_once()
            assert handler.device is None

    def test_close_no_device(self):
        """Test closing when no device is open."""
        handler = KeyboardHandler()
        handler.device = None

        # Should not raise an error
        handler.close()


class TestMockKeyboardHandler:
    """Test MockKeyboardHandler class."""

    def test_init(self):
        """Test initialization of mock handler."""
        handler = MockKeyboardHandler(device_path="/dev/input/event0")

        assert handler.device_path == "/dev/input/event0"
        assert handler.is_available is False

    def test_read_events(self):
        """Test reading events from mock handler."""
        handler = MockKeyboardHandler()

        events = list(handler.read_events())

        assert len(events) == 0

    def test_close(self):
        """Test closing mock handler."""
        handler = MockKeyboardHandler()

        # Should not raise an error
        handler.close()


class TestGetKeyboardHandler:
    """Test get_keyboard_handler function."""

    def test_get_keyboard_handler_linux(self):
        """Test getting handler on Linux."""
        with (
            patch("app.utils.keyboard.IS_LINUX", True),
            patch("app.utils.keyboard.EVDEV_AVAILABLE", True),
            patch("app.utils.keyboard.KeyboardHandler") as mock_handler_class,
        ):
            mock_handler = MagicMock()
            mock_handler_class.return_value = mock_handler

            result = get_keyboard_handler("/dev/input/event0")

            assert result == mock_handler
            mock_handler_class.assert_called_once_with("/dev/input/event0")

    def test_get_keyboard_handler_windows(self):
        """Test getting handler on Windows."""
        with (
            patch("app.utils.keyboard.IS_LINUX", False),
            patch("app.utils.keyboard.IS_WINDOWS", True),
            patch("app.utils.keyboard.MockKeyboardHandler") as mock_handler_class,
        ):
            mock_handler = MagicMock()
            mock_handler_class.return_value = mock_handler

            result = get_keyboard_handler()

            assert result == mock_handler
            mock_handler_class.assert_called_once_with(None)

    def test_get_keyboard_handler_no_evdev(self):
        """Test getting handler when evdev is not available."""
        with (
            patch("app.utils.keyboard.IS_LINUX", True),
            patch("app.utils.keyboard.EVDEV_AVAILABLE", False),
            patch("app.utils.keyboard.MockKeyboardHandler") as mock_handler_class,
        ):
            mock_handler = MagicMock()
            mock_handler_class.return_value = mock_handler

            result = get_keyboard_handler()

            assert result == mock_handler
            mock_handler_class.assert_called_once_with(None)
