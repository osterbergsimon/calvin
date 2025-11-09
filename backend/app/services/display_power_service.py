"""Display power management service."""

import asyncio
import subprocess
from datetime import datetime, time
from typing import Optional

from app.services.config_service import config_service


class DisplayPowerService:
    """Service for managing display power state."""

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the display power scheduler."""
        if self._running:
            return
        self._running = True
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
        # Configure display timeout first (screensaver settings)
        await self.configure_display_timeout()
        
        # Get schedule settings
        schedule_enabled = await config_service.get_value("display_schedule_enabled")
        if not schedule_enabled:
            # Schedule disabled, keep display on
            await self.turn_display_on()
            return

        display_off_time_str = await config_service.get_value("display_off_time")
        display_on_time_str = await config_service.get_value("display_on_time")

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

        # Get current time
        now = datetime.now().time()

        # Determine if display should be on or off
        should_be_on = self._should_display_be_on(now, display_on_time, display_off_time)

        if should_be_on:
            await self.turn_display_on()
        else:
            await self.turn_display_off()

    def _should_display_be_on(
        self, current_time: time, on_time: time, off_time: time
    ) -> bool:
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
        try:
            # Try vcgencmd first (Raspberry Pi specific)
            result = subprocess.run(
                ["vcgencmd", "display_power", "1"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                return
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

        # Fallback to xset (X11)
        try:
            subprocess.run(
                ["xset", "dpms", "force", "on"],
                capture_output=True,
                timeout=5,
                env={"DISPLAY": ":0"},
            )
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

    async def turn_display_off(self):
        """Turn display off."""
        try:
            # Try vcgencmd first (Raspberry Pi specific)
            result = subprocess.run(
                ["vcgencmd", "display_power", "0"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                return
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

        # Fallback to xset (X11)
        try:
            subprocess.run(
                ["xset", "dpms", "force", "off"],
                capture_output=True,
                timeout=5,
                env={"DISPLAY": ":0"},
            )
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

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
        """Configure display timeout (screensaver) based on settings."""
        timeout_enabled = await config_service.get_value("display_timeout_enabled")
        timeout_seconds = await config_service.get_value("display_timeout")
        
        if timeout_enabled and timeout_seconds and timeout_seconds > 0:
            # Enable DPMS and set timeout
            try:
                # Set screen saver timeout (xset uses seconds for 's' command)
                subprocess.run(
                    ["xset", "s", str(timeout_seconds)],
                    capture_output=True,
                    timeout=5,
                    env={"DISPLAY": ":0"},
                )
                # Enable DPMS (Display Power Management Signaling)
                subprocess.run(
                    ["xset", "+dpms"],
                    capture_output=True,
                    timeout=5,
                    env={"DISPLAY": ":0"},
                )
                # Set DPMS standby, suspend, and off times (in seconds)
                # Format: standby suspend off (all in seconds)
                subprocess.run(
                    ["xset", "dpms", str(timeout_seconds), str(timeout_seconds), str(timeout_seconds)],
                    capture_output=True,
                    timeout=5,
                    env={"DISPLAY": ":0"},
                )
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass
        else:
            # Disable display timeout (keep display on)
            try:
                subprocess.run(
                    ["xset", "s", "off"],
                    capture_output=True,
                    timeout=5,
                    env={"DISPLAY": ":0"},
                )
                subprocess.run(
                    ["xset", "-dpms"],
                    capture_output=True,
                    timeout=5,
                    env={"DISPLAY": ":0"},
                )
                subprocess.run(
                    ["xset", "s", "noblank"],
                    capture_output=True,
                    timeout=5,
                    env={"DISPLAY": ":0"},
                )
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass


# Global instance
display_power_service = DisplayPowerService()

