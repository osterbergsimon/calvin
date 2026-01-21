"""Tests for database retry utilities."""

from unittest.mock import patch

import pytest
from sqlalchemy.exc import OperationalError

from app.utils.db_retry import retry_on_db_locked


@pytest.mark.unit
class TestDbRetry:
    """Test database retry decorator."""

    @pytest.mark.asyncio
    async def test_retry_on_db_locked_success(self):
        """Test retry decorator when operation succeeds immediately."""
        call_count = 0

        @retry_on_db_locked(max_retries=3, initial_delay=0.01)
        async def test_func():
            nonlocal call_count
            call_count += 1
            return "success"

        result = await test_func()
        assert result == "success"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_retry_on_db_locked_retries_and_succeeds(self):
        """Test retry decorator when operation succeeds after retries."""
        call_count = 0

        @retry_on_db_locked(max_retries=3, initial_delay=0.01)
        async def test_func():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                # Simulate database locked error
                error = OperationalError("", "", "")
                error.orig = Exception("database is locked")
                raise error
            return "success"

        result = await test_func()
        assert result == "success"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_retry_on_db_locked_exhausts_retries(self):
        """Test retry decorator when all retries are exhausted."""
        call_count = 0

        @retry_on_db_locked(max_retries=2, initial_delay=0.01)
        async def test_func():
            nonlocal call_count
            call_count += 1
            # Always raise database locked error
            error = OperationalError("", "", "")
            error.orig = Exception("database is locked")
            raise error

        with pytest.raises(OperationalError):
            await test_func()

        assert call_count == 3  # Initial attempt + 2 retries

    @pytest.mark.asyncio
    async def test_retry_on_db_locked_non_locked_error(self):
        """Test retry decorator doesn't retry on non-locked errors."""
        call_count = 0

        @retry_on_db_locked(max_retries=3, initial_delay=0.01)
        async def test_func():
            nonlocal call_count
            call_count += 1
            raise ValueError("Some other error")

        with pytest.raises(ValueError, match="Some other error"):
            await test_func()

        assert call_count == 1  # Should not retry

    @pytest.mark.asyncio
    async def test_retry_on_db_locked_string_error(self):
        """Test retry decorator handles string-based errors."""
        call_count = 0

        @retry_on_db_locked(max_retries=2, initial_delay=0.01)
        async def test_func():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise Exception("database is locked")
            return "success"

        result = await test_func()
        assert result == "success"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_retry_on_db_locked_exponential_backoff(self):
        """Test retry decorator uses exponential backoff."""
        delays = []

        @retry_on_db_locked(max_retries=3, initial_delay=0.01, backoff_factor=2.0)
        async def test_func():
            if len(delays) < 3:
                error = OperationalError("", "", "")
                error.orig = Exception("database is locked")
                raise error
            return "success"

        # Mock asyncio.sleep to capture delays without recursion
        async def mock_sleep(delay):
            delays.append(delay)
            # Don't call original sleep to avoid recursion

        with patch("asyncio.sleep", side_effect=mock_sleep):
            await test_func()

        # Should have 3 delays with exponential backoff
        assert len(delays) == 3
        assert delays[0] == 0.01  # initial_delay
        assert delays[1] == 0.02  # initial_delay * backoff_factor
        assert delays[2] == 0.04  # previous * backoff_factor
