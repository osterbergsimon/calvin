"""Display power management service."""

import asyncio
import json
import subprocess
from datetime import datetime, time

try:
    import pytz
except ImportError:
    pytz = None  # pytz not available, will use system timezone

from app.services.config_service import config_service


class DisplayPowerService:
    """Service for managing display power state."""

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self):
        """Start the display power scheduler."""
        if self._running:
            return
        self._running = True
        # Ensure display timeout is disabled on startup (default: keep display on)
        await self.configure_display_timeout()
        self._task = asyncio.create_task(self._scheduler_loop())

    async def stop(self):
        """Stop the display power scheduler."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _scheduler_loop(self):
        """Main scheduler loop that checks time and controls display."""
        while self._running:
            try:
                await self._check_and_update_display()
                # Check every minute
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in display power scheduler: {e}")
                await asyncio.sleep(60)

    async def _check_and_update_display(self):
        """Check current time and update display power state."""
        # Get all display-related config values in one query (more efficient)
        config = await config_service.get_config()

        # Configure display timeout first (screensaver settings)
        # Use the config we just fetched instead of fetching again
        timeout_enabled = config.get("display_timeout_enabled", False)
        timeout_seconds = config.get("display_timeout", 0)
        await self._apply_display_timeout(timeout_enabled, timeout_seconds)

        schedule_enabled = config.get("display_schedule_enabled", False)

        if not schedule_enabled:
            # Schedule disabled, keep display on
            await self.turn_display_on()
            return

        # Get timezone setting (default to system timezone)
        timezone_str = config.get("timezone")
        if timezone_str and pytz:
            try:
                tz = pytz.timezone(timezone_str)
            except (pytz.exceptions.UnknownTimeZoneError, AttributeError):
                # Invalid timezone, use system timezone
                tz = None
        else:
            tz = None

        # Get current time in configured timezone
        if tz:
            now = datetime.now(tz)
        else:
            now = datetime.now()

        # Try to get per-day schedule first (new format)
        display_schedule_str = config.get("display_schedule")
        if display_schedule_str:
            try:
                # Parse JSON schedule
                if isinstance(display_schedule_str, str):
                    schedule = json.loads(display_schedule_str)
                else:
                    schedule = display_schedule_str

                # Get current day of week (0=Monday, 6=Sunday in Python)
                current_day = now.weekday()  # 0=Monday, 6=Sunday

                # Find schedule for current day
                day_schedule = None
                for day_config in schedule:
                    if day_config.get("day") == current_day:
                        day_schedule = day_config
                        break

                if day_schedule and day_schedule.get("enabled", False):
                    # Parse times for this day
                    on_time_str = day_schedule.get("onTime", "06:00")
                    off_time_str = day_schedule.get("offTime", "22:00")

                    try:
                        on_hour, on_minute = map(int, on_time_str.split(":"))
                        off_hour, off_minute = map(int, off_time_str.split(":"))
                        display_on_time = time(on_hour, on_minute)
                        display_off_time = time(off_hour, off_minute)

                        # Get current time
                        current_time = now.time()

                        # Determine if display should be on or off
                        should_be_on = self._should_display_be_on(
                            current_time, display_on_time, display_off_time
                        )

                        if should_be_on:
                            await self.turn_display_on()
                        else:
                            await self.turn_display_off()
                        return
                    except (ValueError, AttributeError):
                        # Invalid time format, keep display on
                        await self.turn_display_on()
                        return
                else:
                    # Day not enabled or not found, keep display on
                    await self.turn_display_on()
                    return
            except (json.JSONDecodeError, TypeError, AttributeError):
                # Invalid schedule format, fall back to old format
                pass

        # Fall back to old format (single on/off time for all days)
        display_off_time_str = config.get("display_off_time")
        display_on_time_str = config.get("display_on_time")

        if not display_off_time_str or not display_on_time_str:
            # No schedule set, keep display on
            await self.turn_display_on()
            return

        # Parse times (format: "HH:MM")
        try:
            off_hour, off_minute = map(int, display_off_time_str.split(":"))
            on_hour, on_minute = map(int, display_on_time_str.split(":"))
            display_off_time = time(off_hour, off_minute)
            display_on_time = time(on_hour, on_minute)
        except (ValueError, AttributeError):
            # Invalid time format, keep display on
            await self.turn_display_on()
            return

        # Get current time in configured timezone
        if tz:
            now = datetime.now(tz).time()
        else:
            now = datetime.now().time()

        # Determine if display should be on or off
        should_be_on = self._should_display_be_on(now, display_on_time, display_off_time)

        if should_be_on:
            await self.turn_display_on()
        else:
            await self.turn_display_off()

    def _should_display_be_on(self, current_time: time, on_time: time, off_time: time) -> bool:
        """Determine if display should be on based on current time and schedule."""
        # Handle case where off_time is before on_time (e.g., 22:00 to 06:00)
        if off_time < on_time:
            # Schedule spans midnight
            return current_time >= on_time or current_time < off_time
        else:
            # Schedule is within same day
            return on_time <= current_time < off_time

    async def turn_display_on(self):
        """Turn display on."""
        # Set up X11 environment
        x11_env = {
            "DISPLAY": ":0",
            "HOME": "/home/calvin",
            "XAUTHORITY": "/home/calvin/.Xauthority",
        }

        # Try multiple methods to ensure display turns on

        # Method 1: vcgencmd (Raspberry Pi HDMI power control)
        try:
            result = subprocess.run(
                ["vcgencmd", "display_power", "1"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                print(f"Display turned on via vcgencmd: {result.stdout.strip()}")
            else:
                print(f"vcgencmd returned non-zero: {result.stderr}")
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            print(f"vcgencmd failed: {e}")

        # Method 2: xset dpms force on (X11 DPMS wake)
        try:
            result = subprocess.run(
                ["xset", "dpms", "force", "on"],
                capture_output=True,
                text=True,
                timeout=5,
                env=x11_env,
            )
            if result.returncode == 0:
                print("Display turned on via xset dpms force on")
            else:
                print(f"xset dpms force on returned non-zero: {result.stderr}")
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            print(f"xset dpms force on failed: {e}")

        # Method 3: Disable DPMS and wake display
        try:
            # Disable DPMS temporarily to wake display
            subprocess.run(
                ["xset", "-dpms"],
                capture_output=True,
                timeout=5,
                env=x11_env,
            )
            # Re-enable DPMS
            subprocess.run(
                ["xset", "+dpms"],
                capture_output=True,
                timeout=5,
                env=x11_env,
            )
            # Force display on
            result = subprocess.run(
                ["xset", "dpms", "force", "on"],
                capture_output=True,
                text=True,
                timeout=5,
                env=x11_env,
            )
            if result.returncode == 0:
                print("Display turned on via xset dpms cycle")
            else:
                print(f"xset dpms cycle returned non-zero: {result.stderr}")
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            print(f"xset dpms cycle failed: {e}")

        # Method 4: Send a dummy key event to wake display (if xdotool is available)
        try:
            result = subprocess.run(
                ["xdotool", "key", "Shift"],
                capture_output=True,
                text=True,
                timeout=5,
                env=x11_env,
            )
            if result.returncode == 0:
                print("Display woken via xdotool")
            else:
                print(f"xdotool returned non-zero: {result.stderr}")
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass  # xdotool not available, skip

    async def turn_display_off(self):
        """Turn display off."""
        # Set up X11 environment
        x11_env = {
            "DISPLAY": ":0",
            "HOME": "/home/calvin",
            "XAUTHORITY": "/home/calvin/.Xauthority",
        }

        # Try multiple methods to ensure display turns off

        # Method 1: vcgencmd (Raspberry Pi HDMI power control)
        try:
            result = subprocess.run(
                ["vcgencmd", "display_power", "0"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                print(f"Display turned off via vcgencmd: {result.stdout.strip()}")
            else:
                print(f"vcgencmd returned non-zero: {result.stderr}")
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            print(f"vcgencmd failed: {e}")

        # Method 2: xset dpms force off (X11 DPMS sleep)
        try:
            result = subprocess.run(
                ["xset", "dpms", "force", "off"],
                capture_output=True,
                text=True,
                timeout=5,
                env=x11_env,
            )
            if result.returncode == 0:
                print("Display turned off via xset dpms force off")
            else:
                print(f"xset dpms force off returned non-zero: {result.stderr}")
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            print(f"xset dpms force off failed: {e}")

    async def get_display_state(self) -> dict:
        """Get current display power state."""
        try:
            # Try vcgencmd first
            result = subprocess.run(
                ["vcgencmd", "display_power"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                # Parse output like "display_power=1"
                output = result.stdout.strip()
                if "=" in output:
                    state = output.split("=")[1]
                    return {"state": "on" if state == "1" else "off", "method": "vcgencmd"}
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

        # Fallback: assume on if we can't determine
        return {"state": "unknown", "method": "unknown"}

    async def configure_display_timeout(self):
        """Configure display timeout (screensaver) based on settings.

        Default behavior: Keep display on (disable timeout) unless explicitly enabled.
        Only enables timeout if both timeout_enabled is True AND timeout_seconds > 0.
        """
        # Get config values (can be called independently, so fetch here)
        config = await config_service.get_config()
        timeout_enabled = config.get("display_timeout_enabled", False)
        timeout_seconds = config.get("display_timeout", 0)
        await self._apply_display_timeout(timeout_enabled, timeout_seconds)

    async def _apply_display_timeout(self, timeout_enabled: bool, timeout_seconds: int):
        """Apply display timeout settings (internal method).

        Args:
            timeout_enabled: Whether timeout is enabled
            timeout_seconds: Timeout in seconds (0 = never)
        """
        # Set up X11 environment
        x11_env = {
            "DISPLAY": ":0",
            "HOME": "/home/calvin",
            "XAUTHORITY": "/home/calvin/.Xauthority",
        }

        # Only enable timeout if explicitly enabled AND timeout > 0
        # Default: keep display on (disable timeout)
        if timeout_enabled is True and timeout_seconds is not None and timeout_seconds > 0:
            # Enable DPMS and set timeout
            try:
                # Set screen saver timeout (xset uses seconds for 's' command)
                subprocess.run(
                    ["xset", "s", str(timeout_seconds)],
                    capture_output=True,
                    timeout=5,
                    env=x11_env,
                )
                # Enable DPMS (Display Power Management Signaling)
                subprocess.run(
                    ["xset", "+dpms"],
                    capture_output=True,
                    timeout=5,
                    env=x11_env,
                )
                # Set DPMS standby, suspend, and off times (in seconds)
                # Format: standby suspend off (all in seconds)
                subprocess.run(
                    [
                        "xset",
                        "dpms",
                        str(timeout_seconds),
                        str(timeout_seconds),
                        str(timeout_seconds),
                    ],
                    capture_output=True,
                    timeout=5,
                    env=x11_env,
                )
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass
        else:
            # Disable display timeout (keep display on) - this is the default behavior
            # Always ensure timeout is disabled unless explicitly enabled above
            try:
                # Disable screensaver
                subprocess.run(
                    ["xset", "s", "off"],
                    capture_output=True,
                    timeout=5,
                    env=x11_env,
                )
                # Disable DPMS (Display Power Management Signaling)
                subprocess.run(
                    ["xset", "-dpms"],
                    capture_output=True,
                    timeout=5,
                    env=x11_env,
                )
                # Prevent screen blanking
                subprocess.run(
                    ["xset", "s", "noblank"],
                    capture_output=True,
                    timeout=5,
                    env=x11_env,
                )
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass


# Global instance
display_power_service = DisplayPowerService()
