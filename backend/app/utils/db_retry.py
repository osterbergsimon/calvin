"""Database retry utilities for handling SQLite concurrency issues."""

import asyncio
from collections.abc import Callable
from functools import wraps
from typing import Any, TypeVar

from loguru import logger
from sqlalchemy.exc import OperationalError

T = TypeVar("T")


def retry_on_db_locked(
    max_retries: int = 3,
    initial_delay: float = 0.1,
    max_delay: float = 1.0,
    backoff_factor: float = 2.0,
):
    """
    Decorator to retry database operations on "database is locked" errors.

    Args:
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds before first retry
        max_delay: Maximum delay between retries
        backoff_factor: Factor to multiply delay by on each retry

    Returns:
        Decorated function that retries on database locked errors
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> T:
            delay = initial_delay
            last_exception = None

            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except OperationalError as e:
                    # Check if it's a "database is locked" error
                    error_str = str(e.orig) if hasattr(e, "orig") else str(e)
                    if "database is locked" in error_str.lower() or "locked" in error_str.lower():
                        if attempt < max_retries:
                            logger.warning(
                                f"Database locked on attempt {attempt + 1}/{max_retries + 1} "
                                f"for {func.__name__}, retrying in {delay:.2f}s..."
                            )
                            await asyncio.sleep(delay)
                            delay = min(delay * backoff_factor, max_delay)
                            last_exception = e
                            continue
                    # Not a locked error or out of retries - re-raise
                    raise
                except Exception as e:
                    # Check if it's a database locked error (could be from Ormar, aiosqlite, etc.)
                    error_str = str(e)
                    # Check for various forms of "database is locked" errors
                    if (
                        "database is locked" in error_str.lower()
                        or "locked" in error_str.lower()
                        or (
                            hasattr(e, "__cause__")
                            and e.__cause__
                            and "locked" in str(e.__cause__).lower()
                        )
                    ):
                        if attempt < max_retries:
                            logger.warning(
                                f"Database locked on attempt {attempt + 1}/{max_retries + 1} "
                                f"for {func.__name__}, retrying in {delay:.2f}s..."
                            )
                            await asyncio.sleep(delay)
                            delay = min(delay * backoff_factor, max_delay)
                            last_exception = e
                            continue
                    # Not a locked error - re-raise
                    raise

            # If we exhausted retries, raise the last exception
            if last_exception:
                logger.error(
                    f"Database operation {func.__name__} failed after {max_retries + 1} attempts "
                    "due to database locked errors"
                )
                raise last_exception
            raise RuntimeError(f"Unexpected retry loop exit for {func.__name__}")

        @wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> T:
            # For sync functions, we can't use asyncio.sleep, so just retry immediately
            # This is less ideal but SQLite locked errors are less common in sync code
            delay = initial_delay
            last_exception = None

            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except OperationalError as e:
                    error_str = str(e.orig) if hasattr(e, "orig") else str(e)
                    if "database is locked" in error_str.lower() or "locked" in error_str.lower():
                        if attempt < max_retries:
                            import time

                            logger.warning(
                                f"Database locked on attempt {attempt + 1}/{max_retries + 1} "
                                f"for {func.__name__}, retrying in {delay:.2f}s..."
                            )
                            time.sleep(delay)
                            delay = min(delay * backoff_factor, max_delay)
                            last_exception = e
                            continue
                    raise
                except Exception as e:
                    if "database is locked" in str(e).lower():
                        if attempt < max_retries:
                            import time

                            logger.warning(
                                f"Database locked on attempt {attempt + 1}/{max_retries + 1} "
                                f"for {func.__name__}, retrying in {delay:.2f}s..."
                            )
                            time.sleep(delay)
                            delay = min(delay * backoff_factor, max_delay)
                            last_exception = e
                            continue
                    raise

            if last_exception:
                logger.error(
                    f"Database operation {func.__name__} failed after {max_retries + 1} attempts "
                    "due to database locked errors"
                )
                raise last_exception
            raise RuntimeError(f"Unexpected retry loop exit for {func.__name__}")

        # Return appropriate wrapper based on whether function is async
        import inspect

        if inspect.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator
