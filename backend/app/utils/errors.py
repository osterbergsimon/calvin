"""Error handling utilities for consistent error responses."""

from fastapi import HTTPException
from loguru import logger

# Generic fallback text for server faults: never derived from the exception.
GENERIC_INTERNAL_ERROR = "Something went wrong on the server. Check the server logs for details."


def internal_error(
    code: str,
    message: str = GENERIC_INTERNAL_ERROR,
    *,
    status_code: int = 500,
    error: BaseException | None = None,
) -> HTTPException:
    """Log a server fault and return a generic, coded error body.

    The exception (and its traceback) goes to the server log only. Clients get
    ``{"code": <stable slug>, "message": <user-facing text>}`` so they can branch
    on the code without parsing prose, and nothing internal leaks (audit S9).

    Args:
        code: Stable snake_case code, e.g. ``plugin_install_failed``.
        message: User-facing text. Must not include exception text.
        status_code: HTTP status; 500 unless the failure is a 502/503-style fault.
        error: The caught exception, logged with its traceback.
    """
    if error is not None:
        logger.opt(exception=error).error(f"{code}: {message}")
    else:
        logger.error(f"{code}: {message}")
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


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
    def internal_error(
        message: str,
        error: Exception | None = None,
        *,
        code: str = "internal_error",
        status_code: int = 500,
    ) -> HTTPException:
        """
        Create a coded 500 Internal Server Error without leaking the exception.

        Args:
            message: User-friendly error message
            error: Optional exception for logging
            code: Stable error code returned to the client
            status_code: HTTP status code

        Returns:
            HTTPException with a ``{"code", "message"}`` detail
        """
        return internal_error(code, message, status_code=status_code, error=error)

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
    logger.exception(f"Error during {operation}: {error}")

    # Determine status code based on error type. A ValueError is the caller's own
    # input (4xx) and may explain itself; anything else is a server fault and
    # must not leak exception text.
    if isinstance(error, ValueError):
        return ErrorResponse.bad_request(error_message)
    elif isinstance(error, FileNotFoundError):
        return ErrorResponse.not_found("Resource")
    else:
        return ErrorResponse.internal_error(
            f"{operation} failed. Check the server logs for details.",
            error,
            code="service_failed",
        )
