"""Unit tests for error handling utilities."""

from unittest.mock import patch

from fastapi import HTTPException

from app.utils.errors import ErrorResponse, handle_service_error


class TestErrorResponse:
    """Test ErrorResponse class."""

    def test_not_found_without_identifier(self):
        """Test not_found without identifier."""
        error = ErrorResponse.not_found("Image")

        assert isinstance(error, HTTPException)
        assert error.status_code == 404
        assert error.detail == "Image not found"

    def test_not_found_with_identifier(self):
        """Test not_found with identifier."""
        error = ErrorResponse.not_found("Plugin", "test-plugin-123")

        assert isinstance(error, HTTPException)
        assert error.status_code == 404
        assert error.detail == "Plugin not found: test-plugin-123"

    def test_bad_request(self):
        """Test bad_request."""
        error = ErrorResponse.bad_request("Invalid input format")

        assert isinstance(error, HTTPException)
        assert error.status_code == 400
        assert error.detail == "Invalid input format"

    def test_internal_error_without_exception(self):
        """Test internal_error without exception."""
        with patch("app.utils.errors.logger") as mock_logger:
            error = ErrorResponse.internal_error("Database connection failed")

            assert isinstance(error, HTTPException)
            assert error.status_code == 500
            assert error.detail == "Database connection failed"
            mock_logger.error.assert_called_once_with("Database connection failed")

    def test_internal_error_with_exception(self):
        """Test internal_error with exception."""
        test_exception = ValueError("Invalid value")
        with patch("app.utils.errors.logger") as mock_logger:
            error = ErrorResponse.internal_error("Processing failed", test_exception)

            assert isinstance(error, HTTPException)
            assert error.status_code == 500
            assert error.detail == "Processing failed"
            mock_logger.error.assert_called_once()
            # Check that exc_info=True was passed
            call_args = mock_logger.error.call_args
            assert call_args[1]["exc_info"] is True

    def test_validation_error(self):
        """Test validation_error."""
        error = ErrorResponse.validation_error("email", "Invalid email format")

        assert isinstance(error, HTTPException)
        assert error.status_code == 400
        assert error.detail == "Validation error for email: Invalid email format"

    def test_unauthorized_default(self):
        """Test unauthorized with default message."""
        error = ErrorResponse.unauthorized()

        assert isinstance(error, HTTPException)
        assert error.status_code == 401
        assert error.detail == "Unauthorized"

    def test_unauthorized_custom(self):
        """Test unauthorized with custom message."""
        error = ErrorResponse.unauthorized("Authentication required")

        assert isinstance(error, HTTPException)
        assert error.status_code == 401
        assert error.detail == "Authentication required"

    def test_forbidden_default(self):
        """Test forbidden with default message."""
        error = ErrorResponse.forbidden()

        assert isinstance(error, HTTPException)
        assert error.status_code == 403
        assert error.detail == "Forbidden"

    def test_forbidden_custom(self):
        """Test forbidden with custom message."""
        error = ErrorResponse.forbidden("Insufficient permissions")

        assert isinstance(error, HTTPException)
        assert error.status_code == 403
        assert error.detail == "Insufficient permissions"


class TestHandleServiceError:
    """Test handle_service_error function."""

    def test_handle_value_error(self):
        """Test handling ValueError."""
        error = ValueError("Invalid input")
        with patch("app.utils.errors.logger") as mock_logger:
            result = handle_service_error("Creating user", error)

            assert isinstance(result, HTTPException)
            assert result.status_code == 400
            assert "Creating user failed" in result.detail
            assert "Invalid input" in result.detail
            mock_logger.error.assert_called_once()

    def test_handle_file_not_found_error(self):
        """Test handling FileNotFoundError."""
        error = FileNotFoundError("File not found: test.txt")
        with patch("app.utils.errors.logger") as mock_logger:
            result = handle_service_error("Loading file", error)

            assert isinstance(result, HTTPException)
            assert result.status_code == 404
            assert "Resource not found" in result.detail
            mock_logger.error.assert_called_once()

    def test_handle_generic_error(self):
        """Test handling generic exception."""
        error = RuntimeError("Unexpected error")
        with patch("app.utils.errors.logger") as mock_logger:
            result = handle_service_error("Processing data", error)

            assert isinstance(result, HTTPException)
            assert result.status_code == 500
            assert "Processing data failed" in result.detail
            # ErrorResponse.internal_error also logs, so called twice
            assert mock_logger.error.call_count == 2

    def test_handle_error_with_default_message(self):
        """Test handling error with default message."""
        error = Exception("")
        with patch("app.utils.errors.logger") as mock_logger:
            result = handle_service_error("Operation", error, "Default error message")

            assert isinstance(result, HTTPException)
            assert result.status_code == 500
            assert "Default error message" in result.detail
            # ErrorResponse.internal_error also logs, so called twice
            assert mock_logger.error.call_count == 2

    def test_handle_error_with_empty_string(self):
        """Test handling error with empty string message."""
        error = Exception("")
        with patch("app.utils.errors.logger") as mock_logger:
            result = handle_service_error("Operation", error)

            assert isinstance(result, HTTPException)
            assert result.status_code == 500
            assert "An error occurred" in result.detail
            # ErrorResponse.internal_error also logs, so called twice
            assert mock_logger.error.call_count == 2

    def test_handle_error_logs_exception_info(self):
        """Test that exception info is logged."""
        error = ValueError("Test error")
        with patch("app.utils.errors.logger") as mock_logger:
            handle_service_error("Test operation", error)

            # Check that exc_info=True was passed
            call_args = mock_logger.error.call_args
            assert call_args[1]["exc_info"] is True
