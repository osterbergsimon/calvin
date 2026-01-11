"""Scheduler service for backend plugin scheduled tasks."""

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger

from app.plugins.protocols import BackendPlugin

# Loguru automatically includes module/function info in logs


class BackendPluginScheduler:
    """Scheduler for backend plugin scheduled tasks."""

    def __init__(self):
        """Initialize scheduler."""
        self.scheduler = AsyncIOScheduler()
        self._registered_tasks: dict[str, str] = {}  # plugin_id -> job_id

    async def start(self) -> None:
        """Start the scheduler."""
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("Backend plugin scheduler started")

    def stop(self) -> None:
        """Stop the scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown()
            self._registered_tasks.clear()
            logger.info("Backend plugin scheduler stopped")

    async def register_plugin_tasks(self, plugin: BackendPlugin) -> None:
        """Register scheduled tasks for a backend plugin.

        Args:
            plugin: Backend plugin instance
        """
        schedule_config = await plugin.get_schedule_config()

        if not schedule_config or not schedule_config.get("enabled", False):
            # Plugin doesn't support scheduling or scheduling is disabled
            return

        plugin_id = plugin.plugin_id

        # Unregister existing tasks for this plugin if any
        await self.unregister_plugin_tasks(plugin_id)

        # Determine trigger type
        trigger = None
        if "cron" in schedule_config and schedule_config["cron"]:
            # Cron-based scheduling
            try:
                # Parse cron expression (format: "minute hour day month day_of_week")
                # e.g., "0 2 * * *" = daily at 2 AM
                cron_expr = schedule_config["cron"]
                cron_parts = cron_expr.split()
                if len(cron_parts) == 5:
                    trigger = CronTrigger(
                        minute=cron_parts[0],
                        hour=cron_parts[1],
                        day=cron_parts[2],
                        month=cron_parts[3],
                        day_of_week=cron_parts[4],
                    )
                else:
                    logger.warning(
                        f"Invalid cron expression for plugin {plugin_id}: {cron_expr}. "
                        "Expected format: 'minute hour day month day_of_week'"
                    )
                    return
            except Exception as e:
                logger.error(
                    f"Error parsing cron expression for plugin {plugin_id}: {e}", exc_info=True
                )
                return
        elif "interval" in schedule_config:
            # Interval-based scheduling (seconds)
            interval = schedule_config["interval"]
            try:
                interval = int(interval)
                if interval > 0:
                    trigger = IntervalTrigger(seconds=interval)
                else:
                    logger.warning(
                        f"Invalid interval for plugin {plugin_id}: {interval}. Must be > 0"
                    )
                    return
            except (ValueError, TypeError) as e:
                logger.error(f"Error parsing interval for plugin {plugin_id}: {e}", exc_info=True)
                return
        else:
            logger.warning(
                f"No valid trigger found in schedule config for plugin {plugin_id}. "
                "Need either 'interval' (seconds) or 'cron' (cron expression)"
            )
            return

        if not trigger:
            return

        # Get max concurrent executions (default: 1)
        max_concurrent = schedule_config.get("max_concurrent", 1)
        try:
            max_concurrent = int(max_concurrent)
            if max_concurrent < 1:
                max_concurrent = 1
        except (ValueError, TypeError):
            max_concurrent = 1

        # Create job function with error handling
        async def run_task_with_error_handling():
            """Run scheduled task with error handling."""
            try:
                result = await plugin.run_scheduled_task()
                if result and isinstance(result, dict):
                    if result.get("success", True):
                        logger.debug(
                            f"Scheduled task for plugin {plugin_id} completed: "
                            f"{result.get('message', 'Success')}"
                        )
                    else:
                        logger.warning(
                            f"Scheduled task for plugin {plugin_id} failed: "
                            f"{result.get('message', 'Unknown error')}"
                        )
            except Exception as e:
                logger.error(
                    f"Error executing scheduled task for plugin {plugin_id}: {e}", exc_info=True
                )

        # Register task with scheduler
        job_id = f"backend_plugin_{plugin_id}"
        try:
            self.scheduler.add_job(
                run_task_with_error_handling,
                trigger=trigger,
                id=job_id,
                replace_existing=True,
                max_instances=max_concurrent,
            )
            self._registered_tasks[plugin_id] = job_id

            trigger_description = (
                f"cron '{schedule_config.get('cron')}'"
                if "cron" in schedule_config
                else f"every {schedule_config.get('interval')} seconds"
            )
            logger.info(
                f"Registered scheduled task for plugin {plugin_id}: {trigger_description} "
                f"(max_concurrent: {max_concurrent})"
            )
        except Exception as e:
            logger.error(
                f"Error registering scheduled task for plugin {plugin_id}: {e}", exc_info=True
            )

    async def unregister_plugin_tasks(self, plugin_id: str) -> None:
        """Unregister scheduled tasks for a plugin.

        Args:
            plugin_id: ID of plugin to unregister tasks for
        """
        if plugin_id not in self._registered_tasks:
            return

        job_id = self._registered_tasks[plugin_id]
        try:
            if self.scheduler.running:
                self.scheduler.remove_job(job_id)
            del self._registered_tasks[plugin_id]
            logger.info(f"Unregistered scheduled task for plugin {plugin_id}")
        except Exception as e:
            logger.warning(
                f"Error unregistering scheduled task for plugin {plugin_id}: {e}", exc_info=True
            )
            # Clean up entry even if removal failed
            self._registered_tasks.pop(plugin_id, None)

    def get_registered_tasks(self) -> dict[str, str]:
        """Get all registered tasks.

        Returns:
            Dictionary mapping plugin_id to job_id
        """
        return self._registered_tasks.copy()


# Global scheduler instance
backend_plugin_scheduler = BackendPluginScheduler()
