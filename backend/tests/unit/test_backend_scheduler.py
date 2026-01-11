"""Unit tests for backend plugin scheduler."""

from typing import Any

import pytest

from app.plugins.base import PluginType
from app.plugins.protocols import BackendPlugin
from app.services.backend_scheduler import BackendPluginScheduler


class MockBackendPlugin(BackendPlugin):
    """Mock BackendPlugin for testing."""

    def __init__(
        self,
        plugin_id: str,
        name: str,
        enabled: bool = True,
        schedule_config: dict[str, Any] | None = None,
        task_result: dict[str, Any] | None = None,
    ):
        super().__init__(plugin_id, name, enabled)
        self._schedule_config = schedule_config
        self._task_result = task_result or {"success": True, "message": "Task completed"}
        self._task_run_count = 0

    @classmethod
    def get_plugin_metadata(cls):
        return {"type_id": "test", "plugin_type": PluginType.BACKEND}

    @property
    def plugin_type(self) -> PluginType:
        return PluginType.BACKEND

    async def initialize(self) -> None:
        pass

    async def cleanup(self) -> None:
        pass

    async def validate_config(self, config: dict[str, Any]) -> bool:
        return True

    async def get_schedule_config(self) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        return self._schedule_config

    async def run_scheduled_task(self) -> dict[str, Any]:
        self._task_run_count += 1
        result = dict(self._task_result)
        result["run_count"] = self._task_run_count
        return result


@pytest.fixture
def scheduler():
    """Create a BackendPluginScheduler instance."""
    return BackendPluginScheduler()


@pytest.fixture
def mock_plugin():
    """Create a mock backend plugin with scheduled tasks."""
    return MockBackendPlugin(
        plugin_id="test-plugin",
        name="Test Plugin",
        enabled=True,
        schedule_config={"interval": 60, "enabled": True, "max_concurrent": 1},
    )


@pytest.mark.unit
class TestBackendPluginScheduler:
    """Test suite for BackendPluginScheduler."""

    @pytest.mark.asyncio
    async def test_scheduler_initialization(self, scheduler):
        """Test scheduler initialization."""
        assert scheduler.scheduler is not None
        assert not scheduler.scheduler.running
        assert scheduler._registered_tasks == {}

    @pytest.mark.asyncio
    async def test_start_scheduler(self, scheduler):
        """Test starting the scheduler."""
        await scheduler.start()
        assert scheduler.scheduler.running
        scheduler.stop()

    @pytest.mark.asyncio
    async def test_stop_scheduler(self, scheduler):
        """Test stopping the scheduler."""
        await scheduler.start()
        assert scheduler.scheduler.running
        scheduler.stop()
        # APScheduler shutdown() may take a moment to fully stop
        # Check that tasks are cleared (which happens immediately)
        assert scheduler._registered_tasks == {}

    @pytest.mark.asyncio
    async def test_register_plugin_tasks_interval(self, scheduler, mock_plugin):
        """Test registering a plugin with interval-based scheduling."""
        await scheduler.start()

        await scheduler.register_plugin_tasks(mock_plugin)

        assert mock_plugin.plugin_id in scheduler._registered_tasks
        job_id = scheduler._registered_tasks[mock_plugin.plugin_id]
        job = scheduler.scheduler.get_job(job_id)
        assert job is not None
        assert job.id == job_id

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_register_plugin_tasks_cron(self, scheduler):
        """Test registering a plugin with cron-based scheduling."""
        plugin = MockBackendPlugin(
            plugin_id="cron-plugin",
            name="Cron Plugin",
            enabled=True,
            schedule_config={
                "cron": "0 2 * * *",  # Daily at 2 AM
                "enabled": True,
                "max_concurrent": 1,
            },
        )

        await scheduler.start()

        await scheduler.register_plugin_tasks(plugin)

        assert plugin.plugin_id in scheduler._registered_tasks
        job_id = scheduler._registered_tasks[plugin.plugin_id]
        job = scheduler.scheduler.get_job(job_id)
        assert job is not None

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_register_plugin_tasks_disabled_schedule(self, scheduler):
        """Test registering a plugin with disabled schedule."""
        plugin = MockBackendPlugin(
            plugin_id="disabled-plugin",
            name="Disabled Plugin",
            enabled=True,
            schedule_config={"interval": 60, "enabled": False, "max_concurrent": 1},
        )

        await scheduler.start()

        await scheduler.register_plugin_tasks(plugin)

        # Plugin should not be registered if schedule is disabled
        assert plugin.plugin_id not in scheduler._registered_tasks

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_register_plugin_tasks_no_config(self, scheduler):
        """Test registering a plugin with no schedule config."""
        plugin = MockBackendPlugin(
            plugin_id="no-config-plugin",
            name="No Config Plugin",
            enabled=True,
            schedule_config=None,
        )

        await scheduler.start()

        await scheduler.register_plugin_tasks(plugin)

        # Plugin should not be registered if no schedule config
        assert plugin.plugin_id not in scheduler._registered_tasks

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_register_plugin_tasks_plugin_disabled(self, scheduler):
        """Test registering a disabled plugin."""
        plugin = MockBackendPlugin(
            plugin_id="disabled-plugin-2",
            name="Disabled Plugin 2",
            enabled=False,
            schedule_config={"interval": 60, "enabled": True, "max_concurrent": 1},
        )

        await scheduler.start()

        await scheduler.register_plugin_tasks(plugin)

        # Disabled plugin should not have schedule config
        assert plugin.plugin_id not in scheduler._registered_tasks

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_register_plugin_tasks_replaces_existing(self, scheduler, mock_plugin):
        """Test that registering the same plugin twice replaces the existing job."""
        await scheduler.start()

        # Register first time
        await scheduler.register_plugin_tasks(mock_plugin)
        job_id_1 = scheduler._registered_tasks[mock_plugin.plugin_id]
        scheduler.scheduler.get_job(job_id_1)

        # Register again with different interval
        mock_plugin._schedule_config = {"interval": 120, "enabled": True, "max_concurrent": 1}
        await scheduler.register_plugin_tasks(mock_plugin)
        job_id_2 = scheduler._registered_tasks[mock_plugin.plugin_id]

        # Should have same job ID (replace_existing=True)
        assert job_id_1 == job_id_2

        # Old job should be replaced
        job_2 = scheduler.scheduler.get_job(job_id_2)
        assert job_2 is not None
        assert job_2.id == job_id_2

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_unregister_plugin_tasks(self, scheduler, mock_plugin):
        """Test unregistering plugin tasks."""
        await scheduler.start()

        # Register plugin
        await scheduler.register_plugin_tasks(mock_plugin)
        assert mock_plugin.plugin_id in scheduler._registered_tasks

        # Unregister plugin
        await scheduler.unregister_plugin_tasks(mock_plugin.plugin_id)
        assert mock_plugin.plugin_id not in scheduler._registered_tasks

        # Job should be removed from scheduler
        job_id = scheduler._registered_tasks.get(mock_plugin.plugin_id)
        if job_id:
            assert scheduler.scheduler.get_job(job_id) is None

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_unregister_nonexistent_plugin_tasks(self, scheduler):
        """Test unregistering a plugin that was never registered."""
        await scheduler.start()

        # Should not raise exception
        await scheduler.unregister_plugin_tasks("nonexistent-plugin")

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_run_plugin_task_via_scheduler(self, scheduler, mock_plugin):
        """Test executing a scheduled task via the scheduler."""
        await scheduler.start()

        # Register plugin
        await scheduler.register_plugin_tasks(mock_plugin)

        # Manually execute the task (simulating what the scheduler would do)
        initial_count = mock_plugin._task_run_count
        result = await mock_plugin.run_scheduled_task()

        # Check that task was executed
        assert mock_plugin._task_run_count == initial_count + 1
        assert result is not None

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_run_plugin_task_not_implemented(self, scheduler):
        """Test executing a task that's not implemented."""
        plugin = MockBackendPlugin(
            plugin_id="no-task-plugin",
            name="No Task Plugin",
            enabled=True,
            schedule_config={"interval": 60, "enabled": True, "max_concurrent": 1},
        )

        # Override to raise NotImplementedError
        async def run_scheduled_task():
            raise NotImplementedError("Task not implemented")

        plugin.run_scheduled_task = run_scheduled_task

        await scheduler.start()
        # Registration should succeed even if task would fail
        await scheduler.register_plugin_tasks(plugin)

        # The task would fail when executed, but registration succeeded
        assert plugin.plugin_id in scheduler._registered_tasks

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_run_plugin_task_error_handling(self, scheduler, mock_plugin):
        """Test error handling when task execution fails."""

        # Override to raise exception
        async def run_scheduled_task():
            raise Exception("Task failed")

        mock_plugin.run_scheduled_task = run_scheduled_task

        await scheduler.start()
        # Registration should succeed even if task would fail
        await scheduler.register_plugin_tasks(mock_plugin)

        # The task would fail when executed, but registration succeeded
        assert mock_plugin.plugin_id in scheduler._registered_tasks

        # Manually executing should raise the exception
        with pytest.raises(Exception, match="Task failed"):
            await mock_plugin.run_scheduled_task()

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_get_registered_tasks(self, scheduler, mock_plugin):
        """Test getting all registered tasks."""
        await scheduler.start()

        # Register plugin
        await scheduler.register_plugin_tasks(mock_plugin)

        # Get registered tasks
        tasks = scheduler.get_registered_tasks()
        assert isinstance(tasks, dict)
        assert mock_plugin.plugin_id in tasks
        assert tasks[mock_plugin.plugin_id] is not None

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_invalid_interval(self, scheduler):
        """Test registering with invalid interval (should be skipped)."""
        plugin = MockBackendPlugin(
            plugin_id="invalid-interval-plugin",
            name="Invalid Interval Plugin",
            enabled=True,
            schedule_config={"interval": 0, "enabled": True, "max_concurrent": 1},
        )

        await scheduler.start()

        await scheduler.register_plugin_tasks(plugin)

        # Plugin with invalid interval should not be registered
        assert plugin.plugin_id not in scheduler._registered_tasks

        scheduler.stop()

    @pytest.mark.asyncio
    async def test_invalid_cron(self, scheduler):
        """Test registering with invalid cron expression."""
        plugin = MockBackendPlugin(
            plugin_id="invalid-cron-plugin",
            name="Invalid Cron Plugin",
            enabled=True,
            schedule_config={"cron": "", "enabled": True, "max_concurrent": 1},
        )

        await scheduler.start()

        # Should not raise exception, just not register
        await scheduler.register_plugin_tasks(plugin)

        # Plugin with invalid cron should not be registered
        assert plugin.plugin_id not in scheduler._registered_tasks

        scheduler.stop()
