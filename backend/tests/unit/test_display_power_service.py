"""Unit tests for display power service."""

from datetime import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.display_power_service import DisplayPowerService


@pytest.fixture
def display_service():
    """Create a DisplayPowerService instance."""
    return DisplayPowerService()


@pytest.fixture
def mock_config():
    """Create a mock config dictionary."""
    return {
        "display_schedule_enabled": False,
        "display_timeout_enabled": False,
        "display_timeout": 0,
        "timezone": None,
    }


class TestDisplayPowerService:
    """Test suite for DisplayPowerService."""

    @pytest.mark.asyncio
    async def test_start_stops_if_already_running(self, display_service):
        """Test that start() does nothing if already running."""
        display_service._running = True

        await display_service.start()

        # Should not have created a new task
        assert display_service._running is True

    @pytest.mark.asyncio
    async def test_start_creates_scheduler_task(self, display_service):
        """Test that start() creates a scheduler task."""
        with patch.object(
            display_service, "configure_display_timeout", new_callable=AsyncMock
        ) as mock_configure:
            await display_service.start()

            assert display_service._running is True
            assert display_service._task is not None
            assert not display_service._task.done()
            mock_configure.assert_called_once()

            # Cleanup
            await display_service.stop()

    @pytest.mark.asyncio
    async def test_stop_cancels_task(self, display_service):
        """Test that stop() cancels the scheduler task."""
        # Start the service
        with patch.object(display_service, "configure_display_timeout", new_callable=AsyncMock):
            await display_service.start()
            task = display_service._task

            # Stop the service
            await display_service.stop()

            assert display_service._running is False
            assert task.cancelled()

    @pytest.mark.asyncio
    async def test_should_display_be_on_same_day_schedule(self, display_service):
        """Test _should_display_be_on with same-day schedule."""
        # Schedule: 08:00 to 20:00
        on_time = time(8, 0)
        off_time = time(20, 0)

        # During schedule
        assert display_service._should_display_be_on(time(10, 0), on_time, off_time) is True
        assert display_service._should_display_be_on(time(15, 0), on_time, off_time) is True

        # Before schedule
        assert display_service._should_display_be_on(time(6, 0), on_time, off_time) is False

        # After schedule
        assert display_service._should_display_be_on(time(21, 0), on_time, off_time) is False

        # At boundaries
        assert display_service._should_display_be_on(time(8, 0), on_time, off_time) is True
        assert display_service._should_display_be_on(time(20, 0), on_time, off_time) is False

    @pytest.mark.asyncio
    async def test_should_display_be_on_midnight_span(self, display_service):
        """Test _should_display_be_on with schedule spanning midnight."""
        # Schedule: 22:00 to 06:00 (spans midnight)
        on_time = time(22, 0)
        off_time = time(6, 0)

        # During schedule (evening)
        assert display_service._should_display_be_on(time(23, 0), on_time, off_time) is True
        assert display_service._should_display_be_on(time(22, 0), on_time, off_time) is True

        # During schedule (early morning)
        assert display_service._should_display_be_on(time(5, 0), on_time, off_time) is True
        assert display_service._should_display_be_on(time(0, 0), on_time, off_time) is True

        # Outside schedule
        assert display_service._should_display_be_on(time(10, 0), on_time, off_time) is False
        assert display_service._should_display_be_on(time(15, 0), on_time, off_time) is False

        # At off boundary
        assert display_service._should_display_be_on(time(6, 0), on_time, off_time) is False

    @pytest.mark.asyncio
    async def test_turn_display_on_raspberry_pi(self, display_service):
        """Test turn_display_on on Raspberry Pi."""
        with (
            patch("app.services.display_power_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_power_service.has_x11", return_value=False),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = "display_power=1"
            mock_subprocess.return_value = mock_result

            await display_service.turn_display_on()

            # Should call vcgencmd
            mock_subprocess.assert_called()
            calls = [str(call) for call in mock_subprocess.call_args_list]
            assert any(
                "vcgencmd" in call and "display_power" in call and "1" in call for call in calls
            )

    @pytest.mark.asyncio
    async def test_turn_display_on_x11(self, display_service):
        """Test turn_display_on with X11."""
        with (
            patch("app.services.display_power_service.is_raspberry_pi", return_value=False),
            patch("app.services.display_power_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_subprocess.return_value = mock_result

            await display_service.turn_display_on()

            # Should call xset commands
            mock_subprocess.assert_called()
            calls = [str(call) for call in mock_subprocess.call_args_list]
            assert any("xset" in call and "dpms" in call for call in calls)

    @pytest.mark.asyncio
    async def test_turn_display_off_raspberry_pi(self, display_service):
        """Test turn_display_off on Raspberry Pi."""
        with (
            patch("app.services.display_power_service.is_raspberry_pi", return_value=True),
            patch("app.services.display_power_service.has_x11", return_value=False),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_subprocess.return_value = mock_result

            await display_service.turn_display_off()

            # Should call vcgencmd with 0
            mock_subprocess.assert_called()
            calls = [str(call) for call in mock_subprocess.call_args_list]
            assert any(
                "vcgencmd" in call and "display_power" in call and "0" in call for call in calls
            )

    @pytest.mark.asyncio
    async def test_turn_display_off_x11(self, display_service):
        """Test turn_display_off with X11."""
        with (
            patch("app.services.display_power_service.is_raspberry_pi", return_value=False),
            patch("app.services.display_power_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_subprocess.return_value = mock_result

            await display_service.turn_display_off()

            # Should call xset dpms force off
            mock_subprocess.assert_called()
            calls = [str(call) for call in mock_subprocess.call_args_list]
            assert any("xset" in call and "dpms" in call and "off" in call for call in calls)

    @pytest.mark.asyncio
    async def test_get_display_state_raspberry_pi_on(self, display_service):
        """Test get_display_state on Raspberry Pi when display is on."""
        with (
            patch("app.services.display_power_service.is_raspberry_pi", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = "display_power=1"
            mock_subprocess.return_value = mock_result

            state = await display_service.get_display_state()

            assert state["state"] == "on"
            assert state["method"] == "vcgencmd"

    @pytest.mark.asyncio
    async def test_get_display_state_raspberry_pi_off(self, display_service):
        """Test get_display_state on Raspberry Pi when display is off."""
        with (
            patch("app.services.display_power_service.is_raspberry_pi", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = "display_power=0"
            mock_subprocess.return_value = mock_result

            state = await display_service.get_display_state()

            assert state["state"] == "off"
            assert state["method"] == "vcgencmd"

    @pytest.mark.asyncio
    async def test_get_display_state_fallback(self, display_service):
        """Test get_display_state fallback when vcgencmd fails."""
        with (
            patch("app.services.display_power_service.is_raspberry_pi", return_value=True),
            patch("subprocess.run", side_effect=FileNotFoundError),
        ):
            state = await display_service.get_display_state()

            assert state["state"] == "unknown"
            assert state["method"] == "unknown"

    @pytest.mark.asyncio
    async def test_check_and_update_display_schedule_disabled(self, display_service, mock_config):
        """Test _check_and_update_display when schedule is disabled."""
        mock_config["display_schedule_enabled"] = False

        with (
            patch(
                "app.services.display_power_service.config_service.get_config",
                new_callable=AsyncMock,
                return_value=mock_config,
            ),
            patch.object(
                display_service, "turn_display_on", new_callable=AsyncMock
            ) as mock_turn_on,
            patch.object(
                display_service, "_apply_display_timeout", new_callable=AsyncMock
            ) as mock_timeout,
        ):
            await display_service._check_and_update_display()

            mock_turn_on.assert_called_once()
            mock_timeout.assert_called_once()

    @pytest.mark.asyncio
    async def test_check_and_update_display_per_day_schedule(self, display_service):
        """Test _check_and_update_display with per-day schedule."""
        # Monday (weekday 0), current time 10:00
        mock_config = {
            "display_schedule_enabled": True,
            "display_schedule": [
                {"day": 0, "enabled": True, "onTime": "08:00", "offTime": "20:00"}
            ],
            "display_timeout_enabled": False,
            "display_timeout": 0,
            "timezone": None,
        }

        with (
            patch(
                "app.services.display_power_service.config_service.get_config",
                new_callable=AsyncMock,
                return_value=mock_config,
            ),
            patch("app.services.display_power_service.datetime") as mock_dt,
            patch.object(
                display_service, "turn_display_on", new_callable=AsyncMock
            ) as mock_turn_on,
            patch.object(
                display_service, "turn_display_off", new_callable=AsyncMock
            ) as mock_turn_off,
            patch.object(display_service, "_apply_display_timeout", new_callable=AsyncMock),
        ):
            # Mock datetime.now to return Monday 10:00
            mock_now = MagicMock()
            mock_now.weekday.return_value = 0  # Monday
            mock_now.time.return_value = time(10, 0)
            mock_dt.now.return_value = mock_now

            await display_service._check_and_update_display()

            # Should turn display on (10:00 is within 08:00-20:00)
            mock_turn_on.assert_called_once()
            mock_turn_off.assert_not_called()

    @pytest.mark.asyncio
    async def test_configure_display_timeout(self, display_service):
        """Test configure_display_timeout."""
        mock_config = {
            "display_timeout_enabled": True,
            "display_timeout": 300,  # 5 minutes
        }

        with (
            patch(
                "app.services.display_power_service.config_service.get_config",
                new_callable=AsyncMock,
                return_value=mock_config,
            ),
            patch.object(
                display_service, "_apply_display_timeout", new_callable=AsyncMock
            ) as mock_apply,
        ):
            await display_service.configure_display_timeout()

            mock_apply.assert_called_once_with(True, 300)

    @pytest.mark.asyncio
    async def test_apply_display_timeout_enabled(self, display_service):
        """Test _apply_display_timeout when enabled."""
        with (
            patch("app.services.display_power_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            await display_service._apply_display_timeout(True, 300)

            # Should call xset commands to enable timeout
            mock_subprocess.assert_called()
            calls = [str(call) for call in mock_subprocess.call_args_list]
            assert any("xset" in call and "s" in call for call in calls)
            assert any("xset" in call and "+dpms" in call for call in calls)

    @pytest.mark.asyncio
    async def test_apply_display_timeout_disabled(self, display_service):
        """Test _apply_display_timeout when disabled."""
        with (
            patch("app.services.display_power_service.has_x11", return_value=True),
            patch("subprocess.run") as mock_subprocess,
        ):
            await display_service._apply_display_timeout(False, 0)

            # Should call xset commands to disable timeout
            mock_subprocess.assert_called()
            calls = [str(call) for call in mock_subprocess.call_args_list]
            assert any("xset" in call and "s" in call and "off" in call for call in calls)
            assert any("xset" in call and "-dpms" in call for call in calls)

    @pytest.mark.asyncio
    async def test_apply_display_timeout_no_x11(self, display_service):
        """Test _apply_display_timeout when X11 is not available."""
        with (
            patch("app.services.display_power_service.has_x11", return_value=False),
            patch("subprocess.run") as mock_subprocess,
        ):
            await display_service._apply_display_timeout(True, 300)

            # Should not call any subprocess commands
            mock_subprocess.assert_not_called()

    @pytest.mark.asyncio
    async def test_check_and_update_display_invalid_schedule(self, display_service):
        """Test _check_and_update_display with invalid schedule format."""
        mock_config = {
            "display_schedule_enabled": True,
            "display_schedule": "invalid json",
            "display_timeout_enabled": False,
            "display_timeout": 0,
            "timezone": None,
        }

        with (
            patch(
                "app.services.display_power_service.config_service.get_config",
                new_callable=AsyncMock,
                return_value=mock_config,
            ),
            patch.object(
                display_service, "turn_display_on", new_callable=AsyncMock
            ) as mock_turn_on,
            patch.object(display_service, "_apply_display_timeout", new_callable=AsyncMock),
        ):
            await display_service._check_and_update_display()

            # Should fall back to keeping display on
            mock_turn_on.assert_called_once()

    @pytest.mark.asyncio
    async def test_check_and_update_display_day_not_enabled(self, display_service):
        """Test _check_and_update_display when current day is not enabled."""
        # Monday (weekday 0), but schedule only for Tuesday (weekday 1)
        mock_config = {
            "display_schedule_enabled": True,
            "display_schedule": [
                {"day": 1, "enabled": True, "onTime": "08:00", "offTime": "20:00"}
            ],
            "display_timeout_enabled": False,
            "display_timeout": 0,
            "timezone": None,
        }

        with (
            patch(
                "app.services.display_power_service.config_service.get_config",
                new_callable=AsyncMock,
                return_value=mock_config,
            ),
            patch("app.services.display_power_service.datetime") as mock_dt,
            patch.object(
                display_service, "turn_display_on", new_callable=AsyncMock
            ) as mock_turn_on,
            patch.object(display_service, "_apply_display_timeout", new_callable=AsyncMock),
        ):
            # Mock datetime.now to return Monday
            mock_now = MagicMock()
            mock_now.weekday.return_value = 0  # Monday
            mock_dt.now.return_value = mock_now

            await display_service._check_and_update_display()

            # Should turn display on (day not in schedule)
            mock_turn_on.assert_called_once()
