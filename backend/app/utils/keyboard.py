"""Keyboard input handling with platform support."""

import platform
from typing import Optional

# Platform detection
IS_LINUX = platform.system() == "Linux"
IS_WINDOWS = platform.system() == "Windows"

# Try to import evdev (Linux only)
if IS_LINUX:
    try:
        import evdev
        from evdev import InputDevice, categorize, ecodes
        EVDEV_AVAILABLE = True
    except ImportError:
        EVDEV_AVAILABLE = False
        evdev = None
        InputDevice = None
        categorize = None
        ecodes = None
else:
    EVDEV_AVAILABLE = False
    evdev = None
    InputDevice = None
    categorize = None
    ecodes = None


class KeyboardHandler:
    """Keyboard input handler with platform support."""

    def __init__(self, device_path: Optional[str] = None):
        """Initialize keyboard handler."""
        self.device_path = device_path
        self.device = None
        self.is_available = False

        if IS_LINUX and EVDEV_AVAILABLE:
            self._init_linux()
        elif IS_WINDOWS:
            self._init_windows()
        else:
            self._init_unsupported()

    def _init_linux(self):
        """Initialize for Linux with evdev."""
        if not EVDEV_AVAILABLE:
            self.is_available = False
            return

        try:
            if self.device_path:
                self.device = InputDevice(self.device_path)
            else:
                # Auto-detect keyboard
                self.device = self._auto_detect_keyboard()
            
            if self.device:
                self.is_available = True
        except Exception as e:
            print(f"Warning: Could not initialize keyboard: {e}")
            self.is_available = False

    def _init_windows(self):
        """Initialize for Windows (mock for development)."""
        self.is_available = False
        print("Warning: Keyboard input not available on Windows. Use for development only.")

    def _init_unsupported(self):
        """Initialize for unsupported platforms."""
        self.is_available = False
        print("Warning: Keyboard input not supported on this platform.")

    def _auto_detect_keyboard(self):
        """Auto-detect keyboard device on Linux."""
        if not EVDEV_AVAILABLE:
            return None

        try:
            import glob
            devices = glob.glob("/dev/input/event*")
            
            for device_path in devices:
                try:
                    device = InputDevice(device_path)
                    # Check if it's a keyboard
                    if ecodes.EV_KEY in device.capabilities():
                        return device
                except Exception:
                    continue
        except Exception:
            pass
        
        return None

    def read_events(self):
        """Read keyboard events (Linux only)."""
        if not self.is_available or not self.device:
            return
        
        try:
            for event in self.device.read_loop():
                if event.type == ecodes.EV_KEY:
                    yield event
        except Exception as e:
            print(f"Error reading keyboard events: {e}")

    def close(self):
        """Close keyboard device."""
        if self.device:
            self.device.close()
            self.device = None


# Mock keyboard handler for Windows development
class MockKeyboardHandler:
    """Mock keyboard handler for Windows development."""

    def __init__(self, device_path: Optional[str] = None):
        """Initialize mock keyboard handler."""
        self.device_path = device_path
        self.is_available = False
        print("Using mock keyboard handler (Windows development mode)")

    def read_events(self):
        """Mock event reader (does nothing on Windows)."""
        return iter([])

    def close(self):
        """Mock close (does nothing)."""
        pass


def get_keyboard_handler(device_path: Optional[str] = None):
    """Get appropriate keyboard handler for current platform."""
    if IS_LINUX and EVDEV_AVAILABLE:
        return KeyboardHandler(device_path)
    else:
        return MockKeyboardHandler(device_path)

