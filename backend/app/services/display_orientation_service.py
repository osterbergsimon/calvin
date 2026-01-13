"""Display orientation service for managing screen rotation on Raspberry Pi."""

import subprocess
from pathlib import Path

from loguru import logger

from app.services.config_service import config_service
from app.utils.platform import has_x11, is_raspberry_pi

# Loguru automatically includes module/function info in logs


class DisplayOrientationService:
    """Service for managing display orientation on Raspberry Pi."""

    def __init__(self):
        """Initialize display orientation service."""
        self._x11_env = {
            "DISPLAY": ":0",
            "HOME": "/home/calvin",
            "XAUTHORITY": "/home/calvin/.Xauthority",
        }

    async def get_current_orientation(self) -> dict:
        """
        Get current display orientation.

        Returns:
            Dictionary with orientation info:
            - orientation: 'landscape' | 'portrait' | 'unknown'
            - flipped: bool (whether 180° rotated)
            - method: 'xrandr' | 'config.txt' | 'unknown'
        """
        if not is_raspberry_pi():
            return {
                "orientation": "unknown",
                "flipped": False,
                "method": "unknown",
                "message": "Not running on Raspberry Pi",
            }

        # Try to get orientation from xrandr (X11)
        if has_x11():
            orientation = await self._get_xrandr_orientation()
            if orientation["orientation"] != "unknown":
                return orientation

        # Try to get orientation from config.txt (framebuffer)
        orientation = await self._get_config_txt_orientation()
        return orientation

    async def _get_xrandr_orientation(self) -> dict:
        """Get orientation from xrandr."""
        try:
            result = subprocess.run(
                ["xrandr", "--query"],
                capture_output=True,
                text=True,
                timeout=5,
                env=self._x11_env,
            )
            if result.returncode == 0:
                # Parse xrandr output to find rotation
                # Look for lines like: "HDMI-1 connected primary 1920x1080+0+0
                # (normal left inverted right x axis y axis) 510mm x 287mm"
                for line in result.stdout.split("\n"):
                    if "connected" in line and (
                        "normal" in line or "left" in line or "right" in line or "inverted" in line
                    ):
                        # Extract rotation info
                        if "inverted" in line:
                            # 180° rotation
                            # Check if it's portrait or landscape by checking resolution
                            if "x" in line:
                                parts = line.split()
                                for i, part in enumerate(parts):
                                    if "x" in part and part[0].isdigit():
                                        # Found resolution like "1920x1080"
                                        width, height = map(int, part.split("x"))
                                        is_portrait = height > width
                                        return {
                                            "orientation": "portrait"
                                            if is_portrait
                                            else "landscape",
                                            "flipped": True,
                                            "method": "xrandr",
                                        }
                        elif "left" in line or "right" in line:
                            # 90° or 270° rotation (portrait)
                            return {
                                "orientation": "portrait",
                                "flipped": False,
                                "method": "xrandr",
                            }
                        else:
                            # Normal (landscape)
                            return {
                                "orientation": "landscape",
                                "flipped": False,
                                "method": "xrandr",
                            }
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            logger.warning("Failed to get xrandr orientation: {}", e)

        return {"orientation": "unknown", "flipped": False, "method": "xrandr"}

    async def _get_config_txt_orientation(self) -> dict:
        """Get orientation from /boot/config.txt."""
        try:
            config_path = Path("/boot/config.txt")
            if not config_path.exists():
                return {"orientation": "unknown", "flipped": False, "method": "config.txt"}

            content = config_path.read_text()
            # Look for display_rotate setting
            # display_rotate=0 = normal (landscape)
            # display_rotate=1 = 90° (portrait)
            # display_rotate=2 = 180° (landscape flipped)
            # display_rotate=3 = 270° (portrait flipped)
            for line in content.split("\n"):
                line = line.strip()
                if line.startswith("display_rotate="):
                    rotate_value = line.split("=")[1].strip()
                    try:
                        rotate = int(rotate_value)
                        if rotate == 0:
                            return {
                                "orientation": "landscape",
                                "flipped": False,
                                "method": "config.txt",
                            }
                        elif rotate == 1:
                            return {
                                "orientation": "portrait",
                                "flipped": False,
                                "method": "config.txt",
                            }
                        elif rotate == 2:
                            return {
                                "orientation": "landscape",
                                "flipped": True,
                                "method": "config.txt",
                            }
                        elif rotate == 3:
                            return {
                                "orientation": "portrait",
                                "flipped": True,
                                "method": "config.txt",
                            }
                    except ValueError:
                        pass
        except Exception as e:
            logger.warning("Failed to read config.txt: {}", e)

        return {"orientation": "unknown", "flipped": False, "method": "config.txt"}

    async def apply_orientation(self, orientation: str, flipped: bool = False) -> dict:
        """
        Apply display orientation.

        Args:
            orientation: 'landscape' | 'portrait'
            flipped: Whether to apply 180° rotation

        Returns:
            Dictionary with result info
        """
        if not is_raspberry_pi():
            return {
                "success": False,
                "message": "Not running on Raspberry Pi - orientation only affects UI layout",
            }

        # Try X11 first (xrandr) - works immediately without reboot
        if has_x11():
            result = await self._apply_xrandr_orientation(orientation, flipped)
            if result["success"]:
                return result

        # Fallback: Update config.txt (requires reboot)
        result = await self._apply_config_txt_orientation(orientation, flipped)
        return result

    async def _apply_xrandr_orientation(self, orientation: str, flipped: bool) -> dict:
        """Apply orientation using xrandr (X11)."""
        try:
            # Get connected display
            result = subprocess.run(
                ["xrandr", "--query"],
                capture_output=True,
                text=True,
                timeout=5,
                env=self._x11_env,
            )
            if result.returncode != 0:
                return {"success": False, "message": "Failed to query displays"}

            # Find connected display
            display_name = None
            for line in result.stdout.split("\n"):
                if " connected" in line and "disconnected" not in line:
                    # Extract display name (first word)
                    display_name = line.split()[0]
                    break

            if not display_name:
                return {"success": False, "message": "No connected display found"}

            # Calculate rotation
            # xrandr rotation options:
            # - normal: 0° (landscape)
            # - left: 90° counter-clockwise (portrait)
            # - right: 90° clockwise (portrait)
            # - inverted: 180° (flipped)
            if flipped:
                rotation = "inverted"
            elif orientation == "portrait":
                # Use 'left' for portrait (90° counter-clockwise)
                rotation = "left"
            else:
                rotation = "normal"

            # Apply rotation
            result = subprocess.run(
                ["xrandr", "--output", display_name, "--rotate", rotation],
                capture_output=True,
                text=True,
                timeout=5,
                env=self._x11_env,
            )

            if result.returncode == 0:
                flipped_text = "flipped" if flipped else "normal"
                return {
                    "success": True,
                    "message": f"Display rotated to {orientation} ({flipped_text})",
                    "method": "xrandr",
                }
            else:
                return {
                    "success": False,
                    "message": f"Failed to rotate display: {result.stderr}",
                }
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            return {"success": False, "message": f"xrandr error: {e}"}

    async def _apply_config_txt_orientation(self, orientation: str, flipped: bool) -> dict:
        """Apply orientation by updating /boot/config.txt (requires reboot)."""
        try:
            config_path = Path("/boot/config.txt")
            if not config_path.exists():
                return {"success": False, "message": "/boot/config.txt not found"}

            content = config_path.read_text()

            # Calculate display_rotate value
            # 0 = normal (landscape)
            # 1 = 90° (portrait)
            # 2 = 180° (landscape flipped)
            # 3 = 270° (portrait flipped)
            if flipped:
                if orientation == "landscape":
                    rotate_value = 2
                else:
                    rotate_value = 3
            else:
                if orientation == "portrait":
                    rotate_value = 1
                else:
                    rotate_value = 0

            # Update or add display_rotate setting
            lines = content.split("\n")
            updated = False
            new_lines = []

            for line in lines:
                if line.strip().startswith("display_rotate="):
                    new_lines.append(f"display_rotate={rotate_value}\n")
                    updated = True
                else:
                    new_lines.append(line + "\n" if line else "\n")

            if not updated:
                # Add display_rotate at the end
                new_lines.append(f"display_rotate={rotate_value}\n")

            # Write back
            config_path.write_text("".join(new_lines))

            flipped_text = "flipped" if flipped else "normal"
            return {
                "success": True,
                "message": (
                    f"Display rotation updated in config.txt (reboot required). "
                    f"Set to {orientation} ({flipped_text})"
                ),
                "method": "config.txt",
                "requires_reboot": True,
            }
        except PermissionError:
            return {
                "success": False,
                "message": "Permission denied: need root to modify /boot/config.txt",
            }
        except Exception as e:
            return {"success": False, "message": f"Failed to update config.txt: {e}"}

    async def sync_with_config(self) -> dict:
        """
        Sync display orientation with current config settings.

        This should be called when orientation settings change.

        Returns:
            Dictionary with result info
        """
        config = await config_service.get_config()
        orientation = config.get("orientation", "landscape")
        flipped = config.get("orientation_flipped", False) or config.get(
            "orientationFlipped", False
        )

        return await self.apply_orientation(orientation, flipped)


# Global instance
display_orientation_service = DisplayOrientationService()
