"""Unit tests for platform detection utilities."""

from unittest.mock import MagicMock, patch

from app.utils.platform import has_x11, is_raspberry_pi


class TestIsRaspberryPi:
    """Test is_raspberry_pi function."""

    def test_is_raspberry_pi_via_device_tree(self, tmp_path):
        """Test detection via /proc/device-tree/model."""
        model_file = tmp_path / "model"
        model_file.write_text("Raspberry Pi 4 Model B")

        with patch("app.utils.platform.Path") as mock_path:
            # Mock Path("/proc/device-tree/model")
            mock_model_path = MagicMock()
            mock_model_path.exists.return_value = True
            mock_model_path.read_text.return_value = "Raspberry Pi 4 Model B"
            mock_path.return_value = mock_model_path

            result = is_raspberry_pi()

            assert result is True

    def test_is_raspberry_pi_via_vcgencmd(self):
        """Test detection via vcgencmd."""
        mock_result = MagicMock()
        mock_result.returncode = 0

        with patch("app.utils.platform.subprocess.run", return_value=mock_result):
            result = is_raspberry_pi()

            assert result is True

    def test_is_raspberry_pi_via_sys_firmware(self, tmp_path):
        """Test detection via /sys/firmware/devicetree/base/model."""
        model_file = tmp_path / "model"
        model_file.write_text("Raspberry Pi Zero W")

        with patch("app.utils.platform.Path") as mock_path:
            # First path doesn't exist, second does
            mock_path1 = MagicMock()
            mock_path1.exists.return_value = False

            mock_path2 = MagicMock()
            mock_path2.exists.return_value = True
            mock_path2.read_text.return_value = "Raspberry Pi Zero W"

            mock_path.side_effect = [mock_path1, mock_path2]

            result = is_raspberry_pi()

            assert result is True

    def test_is_raspberry_pi_not_detected(self):
        """Test when Raspberry Pi is not detected."""
        # Mock all detection methods to fail
        with (
            patch("app.utils.platform.Path") as mock_path,
            patch("app.utils.platform.subprocess.run") as mock_subprocess,
        ):
            # Device tree path doesn't exist
            mock_path1 = MagicMock()
            mock_path1.exists.return_value = False

            # vcgencmd fails
            mock_subprocess.side_effect = FileNotFoundError()

            # sys/firmware path doesn't exist
            mock_path2 = MagicMock()
            mock_path2.exists.return_value = False

            mock_path.side_effect = [mock_path1, mock_path2]

            result = is_raspberry_pi()

            assert result is False

    def test_is_raspberry_pi_device_tree_read_error(self):
        """Test handling of read errors from device tree."""
        with patch("app.utils.platform.Path") as mock_path:
            mock_model_path = MagicMock()
            mock_model_path.exists.return_value = True
            mock_model_path.read_text.side_effect = PermissionError("Permission denied")
            mock_path.return_value = mock_model_path

            # Should fall back to other methods
            with patch("app.utils.platform.subprocess.run") as mock_subprocess:
                mock_subprocess.side_effect = FileNotFoundError()

                with patch("app.utils.platform.Path") as mock_path2:
                    mock_path2.return_value.exists.return_value = False

                    result = is_raspberry_pi()

                    assert result is False

    def test_is_raspberry_pi_vcgencmd_timeout(self):
        """Test handling of vcgencmd timeout."""
        import subprocess

        with (
            patch("app.utils.platform.Path") as mock_path,
            patch("app.utils.platform.subprocess.run") as mock_subprocess,
        ):
            # Device tree doesn't exist
            mock_path1 = MagicMock()
            mock_path1.exists.return_value = False

            # vcgencmd times out
            mock_subprocess.side_effect = subprocess.TimeoutExpired("vcgencmd", 2)

            # sys/firmware doesn't exist
            mock_path2 = MagicMock()
            mock_path2.exists.return_value = False

            mock_path.side_effect = [mock_path1, mock_path2]

            result = is_raspberry_pi()

            assert result is False

    def test_is_raspberry_pi_case_insensitive(self):
        """Test that detection is case-insensitive."""
        with patch("app.utils.platform.Path") as mock_path:
            mock_model_path = MagicMock()
            mock_model_path.exists.return_value = True
            mock_model_path.read_text.return_value = "raspberry pi 4"  # lowercase
            mock_path.return_value = mock_model_path

            result = is_raspberry_pi()

            assert result is True


class TestHasX11:
    """Test has_x11 function."""

    def test_has_x11_success(self):
        """Test successful X11 detection."""
        mock_result = MagicMock()
        mock_result.returncode = 0

        with patch("app.utils.platform.subprocess.run", return_value=mock_result):
            result = has_x11()

            assert result is True

    def test_has_x11_not_available(self):
        """Test when X11 is not available."""
        mock_result = MagicMock()
        mock_result.returncode = 1

        with patch("app.utils.platform.subprocess.run", return_value=mock_result):
            result = has_x11()

            assert result is False

    def test_has_x11_command_not_found(self):
        """Test when xset command is not found."""
        with patch("app.utils.platform.subprocess.run", side_effect=FileNotFoundError()):
            result = has_x11()

            assert result is False

    def test_has_x11_timeout(self):
        """Test handling of timeout."""
        import subprocess

        with patch(
            "app.utils.platform.subprocess.run",
            side_effect=subprocess.TimeoutExpired("xset", 2),
        ):
            result = has_x11()

            assert result is False

    def test_has_x11_calls_with_display(self):
        """Test that xset is called with DISPLAY environment variable."""
        with patch("app.utils.platform.subprocess.run") as mock_subprocess:
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_subprocess.return_value = mock_result

            has_x11()

            # Check that subprocess.run was called with env containing DISPLAY
            call_args = mock_subprocess.call_args
            assert call_args is not None
            assert "env" in call_args.kwargs
            assert call_args.kwargs["env"]["DISPLAY"] == ":0"
