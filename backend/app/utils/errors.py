"""Error handling utilities for consistent error responses."""

import logging

from fastapi import HTTPException

logger = logging.getLogger(__name__)


class ErrorResponse:
    """Standardized error response helper."""

    @staticmethod
    def not_found(resource: str, identifier: str | None = None) -> HTTPException:
        """
        Create a 404 Not Found error.

        Args:
            resource: Type of resource (e.g., "Image", "Plugin", "Calendar source")
            identifier: Optional identifier that was not found

        Returns:
            HTTPException with 404 status
        """
        detail = f"{resource} not found"
        if identifier:
            detail += f": {identifier}"
        return HTTPException(status_code=404, detail=detail)

    @staticmethod
    def bad_request(message: str) -> HTTPException:
        """
        Create a 400 Bad Request error.

        Args:
            message: Error message

        Returns:
            HTTPException with 400 status
        """
        return HTTPException(status_code=400, detail=message)

    @staticmethod
    def internal_error(message: str, error: Exception | None = None) -> HTTPException:
        """
        Create a 500 Internal Server Error.

        Args:
            message: User-friendly error message
            error: Optional exception for logging

        Returns:
            HTTPException with 500 status
        """
        if error:
            logger.error(f"{message}: {error}", exc_info=True)
        else:
            logger.error(message)
        return HTTPException(status_code=500, detail=message)

    @staticmethod
    def validation_error(field: str, message: str) -> HTTPException:
        """
        Create a 400 Validation Error.

        Args:
            field: Field name that failed validation
            message: Validation error message

        Returns:
            HTTPException with 400 status
        """
        detail = f"Validation error for {field}: {message}"
        return HTTPException(status_code=400, detail=detail)

    @staticmethod
    def unauthorized(message: str = "Unauthorized") -> HTTPException:
        """
        Create a 401 Unauthorized error.

        Args:
            message: Error message

        Returns:
            HTTPException with 401 status
        """
        return HTTPException(status_code=401, detail=message)

    @staticmethod
    def forbidden(message: str = "Forbidden") -> HTTPException:
        """
        Create a 403 Forbidden error.

        Args:
            message: Error message

        Returns:
            HTTPException with 403 status
        """
        return HTTPException(status_code=403, detail=message)


def handle_service_error(
    operation: str, error: Exception, default_message: str | None = None
) -> HTTPException:
    """
    Handle errors from service layer with consistent logging and error responses.

    Args:
        operation: Description of the operation that failed
        error: The exception that occurred
        default_message: Optional default message if error message is not available

    Returns:
        HTTPException with appropriate status code
    """
    error_message = str(error) if str(error) else (default_message or "An error occurred")
    logger.error(f"Error during {operation}: {error}", exc_info=True)

    # Determine status code based on error type
    if isinstance(error, ValueError):
        return ErrorResponse.bad_request(f"{operation} failed: {error_message}")
    elif isinstance(error, FileNotFoundError):
        return ErrorResponse.not_found("Resource", error_message)
    else:
        return ErrorResponse.internal_error(f"{operation} failed: {error_message}", error)
