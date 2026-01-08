"""Unit tests for display orientation service."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.display_orientation_service import DisplayOrientationService


@pytest.fixture
def orientation_service():
    """Create a DisplayOrientationService instance."""
    return DisplayOrientationService()


class TestDisplayOrientationService:
    """Test suite for DisplayOrientationService."""

    @pytest.mark.asyncio
    async def test_get_current_orientation_not_raspberry_pi(self, orientation_service):
        """Test get_current_orientation when not on Raspberry Pi."""
        with patch("app.services.display_orientation_service.is_raspberry_pi", return_value=False):
            result = await orientation_service.get_current_orientation()

            assert result["orientation"] == "unknown"
            assert result["flipped"] is False
            assert result["method"] == "unknown"
            assert "Not running on Raspberry Pi" in result["message"]

    @pytest.mark.asyncio
    async def test_get_current_orientation_xrandr_landscape(self, orientation_service):
        """Test get_current_orientation with xrandr showing landscape."""
        # The parser checks for "inverted" first, so avoid it in the parentheses
        # Format resolution as separate token: "1920x1080" not "1920x1080+0+0"
        xrandr_output = "HDMI-1 connected primary 1920x1080 +0+0 normal 510mm x 287mm"

        with (
            patch("app.services.display_orientation_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_orientation_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = xrandr_output
            mock_subprocess.return_value = mock_result

            result = await orientation_service.get_current_orientation()

            assert result["orientation"] == "landscape"
            assert result["flipped"] is False
            assert result["method"] == "xrandr"

    @pytest.mark.asyncio
    async def test_get_current_orientation_xrandr_portrait_left(self, orientation_service):
        """Test get_current_orientation with xrandr showing portrait (left rotation)."""
        # Format resolution as separate token, avoid "inverted" in parentheses
        xrandr_output = "HDMI-1 connected primary 1080x1920 +0+0 left 287mm x 510mm"

        with (
            patch("app.services.display_orientation_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_orientation_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = xrandr_output
            mock_subprocess.return_value = mock_result

            result = await orientation_service.get_current_orientation()

            assert result["orientation"] == "portrait"
            assert result["flipped"] is False
            assert result["method"] == "xrandr"

    @pytest.mark.asyncio
    async def test_get_current_orientation_xrandr_inverted_landscape(self, orientation_service):
        """Test get_current_orientation with xrandr showing inverted (flipped) landscape."""
        # Format resolution as separate token
        xrandr_output = "HDMI-1 connected primary 1920x1080 +0+0 inverted 510mm x 287mm"

        with (
            patch("app.services.display_orientation_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_orientation_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = xrandr_output
            mock_subprocess.return_value = mock_result

            result = await orientation_service.get_current_orientation()

            assert result["orientation"] == "landscape"
            assert result["flipped"] is True
            assert result["method"] == "xrandr"

    @pytest.mark.asyncio
    async def test_get_current_orientation_xrandr_inverted_portrait(self, orientation_service):
        """Test get_current_orientation with xrandr showing inverted portrait."""
        # Format resolution as separate token
        xrandr_output = "HDMI-1 connected primary 1080x1920 +0+0 inverted 287mm x 510mm"

        with (
            patch("app.services.display_orientation_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_orientation_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = xrandr_output
            mock_subprocess.return_value = mock_result

            result = await orientation_service.get_current_orientation()

            assert result["orientation"] == "portrait"
            assert result["flipped"] is True
            assert result["method"] == "xrandr"

    @pytest.mark.asyncio
    async def test_get_current_orientation_xrandr_fallback_to_config_txt(self, orientation_service):
        """Test get_current_orientation falls back to config.txt when xrandr fails."""
        with (
            patch("app.services.display_orientation_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_orientation_service.has_x11", return_value=True),
            patch("subprocess.run", side_effect=FileNotFoundError),
            patch("app.services.display_orientation_service.Path") as mock_path_class,
        ):
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=0\n"
            mock_path_class.return_value = mock_config_path

            result = await orientation_service.get_current_orientation()

            assert result["orientation"] == "landscape"
            assert result["flipped"] is False
            assert result["method"] == "config.txt"

    @pytest.mark.asyncio
    async def test_get_config_txt_orientation_rotate_0(self, orientation_service):
        """Test _get_config_txt_orientation with display_rotate=0 (landscape)."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=0\n"
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._get_config_txt_orientation()

            assert result["orientation"] == "landscape"
            assert result["flipped"] is False
            assert result["method"] == "config.txt"

    @pytest.mark.asyncio
    async def test_get_config_txt_orientation_rotate_1(self, orientation_service):
        """Test _get_config_txt_orientation with display_rotate=1 (portrait)."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=1\n"
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._get_config_txt_orientation()

            assert result["orientation"] == "portrait"
            assert result["flipped"] is False
            assert result["method"] == "config.txt"

    @pytest.mark.asyncio
    async def test_get_config_txt_orientation_rotate_2(self, orientation_service):
        """Test _get_config_txt_orientation with display_rotate=2 (landscape flipped)."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=2\n"
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._get_config_txt_orientation()

            assert result["orientation"] == "landscape"
            assert result["flipped"] is True
            assert result["method"] == "config.txt"

    @pytest.mark.asyncio
    async def test_get_config_txt_orientation_rotate_3(self, orientation_service):
        """Test _get_config_txt_orientation with display_rotate=3 (portrait flipped)."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=3\n"
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._get_config_txt_orientation()

            assert result["orientation"] == "portrait"
            assert result["flipped"] is True
            assert result["method"] == "config.txt"

    @pytest.mark.asyncio
    async def test_get_config_txt_orientation_not_found(self, orientation_service):
        """Test _get_config_txt_orientation when config.txt doesn't exist."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = False
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._get_config_txt_orientation()

            assert result["orientation"] == "unknown"
            assert result["flipped"] is False
            assert result["method"] == "config.txt"

    @pytest.mark.asyncio
    async def test_apply_orientation_not_raspberry_pi(self, orientation_service):
        """Test apply_orientation when not on Raspberry Pi."""
        with patch("app.services.display_orientation_service.is_raspberry_pi", return_value=False):
            result = await orientation_service.apply_orientation("landscape", False)

            assert result["success"] is False
            assert "Not running on Raspberry Pi" in result["message"]

    @pytest.mark.asyncio
    async def test_apply_orientation_xrandr_success(self, orientation_service):
        """Test apply_orientation with xrandr (X11) success."""
        xrandr_query_output = "HDMI-1 connected primary 1920x1080+0+0"

        with (
            patch("app.services.display_orientation_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_orientation_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            # First call: query displays
            mock_query_result = MagicMock()
            mock_query_result.returncode = 0
            mock_query_result.stdout = xrandr_query_output

            # Second call: apply rotation
            mock_rotate_result = MagicMock()
            mock_rotate_result.returncode = 0

            mock_subprocess.side_effect = [mock_query_result, mock_rotate_result]

            result = await orientation_service.apply_orientation("landscape", False)

            assert result["success"] is True
            assert result["method"] == "xrandr"
            assert "landscape" in result["message"]

    @pytest.mark.asyncio
    async def test_apply_orientation_xrandr_portrait(self, orientation_service):
        """Test apply_orientation with xrandr for portrait."""
        xrandr_query_output = "HDMI-1 connected primary 1920x1080+0+0"

        with (
            patch("app.services.display_orientation_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_orientation_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_query_result = MagicMock()
            mock_query_result.returncode = 0
            mock_query_result.stdout = xrandr_query_output

            mock_rotate_result = MagicMock()
            mock_rotate_result.returncode = 0

            mock_subprocess.side_effect = [mock_query_result, mock_rotate_result]

            result = await orientation_service.apply_orientation("portrait", False)

            assert result["success"] is True
            # Should use 'left' rotation for portrait
            calls = [str(call) for call in mock_subprocess.call_args_list]
            assert any("--rotate" in call and "left" in call for call in calls)

    @pytest.mark.asyncio
    async def test_apply_orientation_xrandr_flipped(self, orientation_service):
        """Test apply_orientation with xrandr for flipped orientation."""
        xrandr_query_output = "HDMI-1 connected primary 1920x1080+0+0"

        with (
            patch("app.services.display_orientation_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_orientation_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_query_result = MagicMock()
            mock_query_result.returncode = 0
            mock_query_result.stdout = xrandr_query_output

            mock_rotate_result = MagicMock()
            mock_rotate_result.returncode = 0

            mock_subprocess.side_effect = [mock_query_result, mock_rotate_result]

            result = await orientation_service.apply_orientation("landscape", True)

            assert result["success"] is True
            # Should use 'inverted' rotation for flipped
            calls = [str(call) for call in mock_subprocess.call_args_list]
            assert any("--rotate" in call and "inverted" in call for call in calls)

    @pytest.mark.asyncio
    async def test_apply_orientation_xrandr_fallback_to_config_txt(self, orientation_service):
        """Test apply_orientation falls back to config.txt when xrandr fails."""
        with (
            patch("app.services.display_orientation_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_orientation_service.has_x11", return_value=True),
            patch("subprocess.run", side_effect=FileNotFoundError),
            patch("app.services.display_orientation_service.Path") as mock_path_class,
        ):
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=0\n"
            mock_config_path.write_text = MagicMock()
            mock_path_class.return_value = mock_config_path

            result = await orientation_service.apply_orientation("landscape", False)

            assert result["success"] is True
            assert result["method"] == "config.txt"
            assert result["requires_reboot"] is True

    @pytest.mark.asyncio
    async def test_apply_config_txt_orientation_landscape(self, orientation_service):
        """Test _apply_config_txt_orientation for landscape."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=0\n"
            mock_config_path.write_text = MagicMock()
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._apply_config_txt_orientation("landscape", False)

            assert result["success"] is True
            assert result["method"] == "config.txt"
            assert result["requires_reboot"] is True
            # Should write display_rotate=0
            mock_config_path.write_text.assert_called_once()
            assert "display_rotate=0" in mock_config_path.write_text.call_args[0][0]

    @pytest.mark.asyncio
    async def test_apply_config_txt_orientation_portrait(self, orientation_service):
        """Test _apply_config_txt_orientation for portrait."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=0\n"
            mock_config_path.write_text = MagicMock()
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._apply_config_txt_orientation("portrait", False)

            assert result["success"] is True
            # Should write display_rotate=1 for portrait
            mock_config_path.write_text.assert_called_once()
            assert "display_rotate=1" in mock_config_path.write_text.call_args[0][0]

    @pytest.mark.asyncio
    async def test_apply_config_txt_orientation_landscape_flipped(self, orientation_service):
        """Test _apply_config_txt_orientation for flipped landscape."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=0\n"
            mock_config_path.write_text = MagicMock()
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._apply_config_txt_orientation("landscape", True)

            assert result["success"] is True
            # Should write display_rotate=2 for flipped landscape
            mock_config_path.write_text.assert_called_once()
            assert "display_rotate=2" in mock_config_path.write_text.call_args[0][0]

    @pytest.mark.asyncio
    async def test_apply_config_txt_orientation_portrait_flipped(self, orientation_service):
        """Test _apply_config_txt_orientation for flipped portrait."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=0\n"
            mock_config_path.write_text = MagicMock()
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._apply_config_txt_orientation("portrait", True)

            assert result["success"] is True
            # Should write display_rotate=3 for flipped portrait
            mock_config_path.write_text.assert_called_once()
            assert "display_rotate=3" in mock_config_path.write_text.call_args[0][0]

    @pytest.mark.asyncio
    async def test_apply_config_txt_orientation_updates_existing(self, orientation_service):
        """Test _apply_config_txt_orientation updates existing display_rotate line."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=0\nother_setting=value\n"
            mock_config_path.write_text = MagicMock()
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._apply_config_txt_orientation("portrait", False)

            assert result["success"] is True
            # Should update existing line
            written_content = mock_config_path.write_text.call_args[0][0]
            assert "display_rotate=1" in written_content
            assert "other_setting=value" in written_content

    @pytest.mark.asyncio
    async def test_apply_config_txt_orientation_adds_if_missing(self, orientation_service):
        """Test _apply_config_txt_orientation adds display_rotate if not present."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "other_setting=value\n"
            mock_config_path.write_text = MagicMock()
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._apply_config_txt_orientation("landscape", False)

            assert result["success"] is True
            # Should add display_rotate line
            written_content = mock_config_path.write_text.call_args[0][0]
            assert "display_rotate=0" in written_content

    @pytest.mark.asyncio
    async def test_apply_config_txt_orientation_permission_error(self, orientation_service):
        """Test _apply_config_txt_orientation handles permission errors."""
        with patch("app.services.display_orientation_service.Path") as mock_path_class:
            mock_config_path = MagicMock()
            mock_config_path.exists.return_value = True
            mock_config_path.read_text.return_value = "display_rotate=0\n"
            mock_config_path.write_text.side_effect = PermissionError("Permission denied")
            mock_path_class.return_value = mock_config_path

            result = await orientation_service._apply_config_txt_orientation("landscape", False)

            assert result["success"] is False
            assert "Permission denied" in result["message"]

    @pytest.mark.asyncio
    async def test_sync_with_config(self, orientation_service):
        """Test sync_with_config applies orientation from config."""
        mock_config = {
            "orientation": "portrait",
            "orientation_flipped": True,
        }

        with (
            patch(
                "app.services.display_orientation_service.config_service.get_config",
                new_callable=AsyncMock,
                return_value=mock_config,
            ),
            patch.object(
                orientation_service, "apply_orientation", new_callable=AsyncMock
            ) as mock_apply,
        ):
            await orientation_service.sync_with_config()

            mock_apply.assert_called_once_with("portrait", True)

    @pytest.mark.asyncio
    async def test_sync_with_config_uses_orientation_flipped_camelcase(self, orientation_service):
        """Test sync_with_config uses orientationFlipped if orientation_flipped missing."""
        mock_config = {
            "orientation": "landscape",
            "orientationFlipped": True,
        }

        with (
            patch(
                "app.services.display_orientation_service.config_service.get_config",
                new_callable=AsyncMock,
                return_value=mock_config,
            ),
            patch.object(
                orientation_service, "apply_orientation", new_callable=AsyncMock
            ) as mock_apply,
        ):
            await orientation_service.sync_with_config()

            mock_apply.assert_called_once_with("landscape", True)
