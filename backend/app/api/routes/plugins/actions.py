"""Run a declared plugin action (homey switch tiles §2).

``POST /api/plugins/{plugin_id}/actions/{action}`` is in ``PUBLIC_WRITES``: a
person at a wall screen with no login can call it. So the host runs only an
action the instance's plugin declared, with params validated against that
declaration, and the existing Host/Origin checks still apply. Whether a given
call is allowed beyond that (for example, which devices) is the plugin's job.

Nothing here returns or logs config, and plugin exception text never reaches
the caller: ``PluginActionError`` messages are written by the plugin for the
screen; anything else becomes a generic 500.
"""

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from app.models.db_models import PluginDB
from app.plugins.actions import (
    ACTION_TIMEOUT_S,
    MAX_ERROR_MESSAGE,
    ActionParamsError,
    PluginActionError,
    PluginActionRefused,
    action_in_flight,
    action_rate_limiter,
    describe_unknown,
    validate_action_params,
)
from app.plugins.manager import plugin_manager
from app.plugins.protocols import ServicePlugin

router = APIRouter()


class PluginActionRequest(BaseModel):
    """Body of a plugin action call: only ``params``, checked against the declaration.

    Extra top-level keys are accepted here and refused in the route, with a
    bounded message: the generic 422 handler would echo every one in full.
    """

    params: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="allow")


def _error(status_code: int, code: str, message: str, **kwargs: Any) -> HTTPException:
    return HTTPException(
        status_code=status_code, detail={"code": code, "message": message}, **kwargs
    )


def _raise_site(error: BaseException) -> str:
    """``file:line in function`` of the innermost frame, with no values."""
    tb = error.__traceback__
    if tb is None:
        return "unknown"
    while tb.tb_next is not None:
        tb = tb.tb_next
    code = tb.tb_frame.f_code
    return f"{code.co_filename}:{tb.tb_lineno} in {code.co_name}"


def _plugin_message(error: PluginActionError) -> str:
    message = error.message if isinstance(error.message, str) else ""
    return message[:MAX_ERROR_MESSAGE] or "The action failed."


@router.post("/plugins/{plugin_id}/actions/{action}")
async def run_plugin_action(
    plugin_id: str, action: str, request: PluginActionRequest
) -> dict[str, Any]:
    """Run ``action`` on the service plugin instance ``plugin_id``.

    Checks, in order: the instance exists and is a service plugin (404), is
    enabled (409) and running (409; this route never starts an instance), the
    action is declared (404), the params match the declaration (422), and the
    instance is under its rate limit and has fewer than two actions running
    (both 429). The call is cancelled after ``ACTION_TIMEOUT_S`` (504). Only then is ``perform_action``
    called, with the validated params. Its dict is returned unchanged.
    """
    db_plugin = await PluginDB.objects.get_or_none(id=plugin_id)
    instance = plugin_manager.get_plugin(plugin_id) if db_plugin else None
    if db_plugin is None or not isinstance(instance, ServicePlugin):
        raise _error(404, "plugin_not_found", "Plugin instance not found.")

    if not db_plugin.enabled or not instance.enabled:
        raise _error(409, "plugin_disabled", "Plugin instance is disabled.")
    if not instance.is_running():
        raise _error(409, "plugin_stopped", "Plugin instance is not running.")

    metadata = getattr(type(instance), "metadata", None)
    spec = metadata.action(action) if metadata is not None else None
    if spec is None:
        raise _error(404, "unknown_action", "This plugin has no such action.")

    extra_keys = describe_unknown("body key", request.model_extra or {})
    if extra_keys:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_action_body",
                "message": "The request body must hold only params.",
                "errors": [extra_keys],
            },
        )

    try:
        params = validate_action_params(spec, request.params)
    except ActionParamsError as e:
        # The error list names keys and types only; it never echoes values.
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_action_params",
                "message": "The action's parameters are not valid.",
                "errors": e.errors,
            },
        ) from None

    if not action_rate_limiter.allow(plugin_id):
        raise _error(
            429,
            "rate_limited",
            "Too many actions. Try again in a moment.",
            headers={"Retry-After": "1"},
        )

    if not action_in_flight.try_acquire(plugin_id):
        raise _error(
            429,
            "action_busy",
            "Another action is still running. Try again in a moment.",
            headers={"Retry-After": "1"},
        )

    logger.info("Plugin action {} on {} params={}", action, plugin_id, params)

    try:
        result = await asyncio.wait_for(instance.perform_action(action, params), ACTION_TIMEOUT_S)
    except TimeoutError:
        # wait_for has cancelled the plugin's call. Log names only, no traceback.
        logger.warning("Plugin action {} on {} timed out", action, plugin_id)
        raise _error(
            504, "plugin_action_timeout", "The action took too long and was stopped."
        ) from None
    except PluginActionRefused as e:
        logger.info("Plugin action {} on {} refused by the plugin", action, plugin_id)
        raise _error(403, "plugin_action_refused", _plugin_message(e)) from None
    except PluginActionError as e:
        logger.warning("Plugin action {} on {} failed", action, plugin_id)
        raise _error(502, "plugin_action_failed", _plugin_message(e)) from None
    except Exception as e:
        # Not ``internal_error(error=e)``: a traceback (with loguru's diagnose
        # on, the default) prints local values, which in plugin frames can be
        # config or secrets. Log only the exception type and where it was raised.
        logger.error(
            "Plugin action {} on {} raised {} at {}",
            action,
            plugin_id,
            type(e).__name__,
            _raise_site(e),
        )
        raise _error(
            500,
            "plugin_action_error",
            "The action failed. Check the server logs for details.",
        ) from None
    finally:
        action_in_flight.release(plugin_id)

    if not isinstance(result, dict):
        logger.error(
            "Plugin action {} on {} returned {}, not a dict",
            action,
            plugin_id,
            type(result).__name__,
        )
        raise _error(
            500,
            "plugin_action_error",
            "The action failed. Check the server logs for details.",
        )
    return result
