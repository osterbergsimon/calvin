"""Unit tests for plugin action helpers: param validation, errors, rate limiter."""

import pytest

from app.plugins.actions import (
    MAX_STRING_PARAM,
    ActionParamsError,
    ActionRateLimiter,
    PluginActionError,
    PluginActionRefused,
    validate_action_params,
)
from app.plugins.definitions import ActionParamSpec, PluginActionSpec

pytestmark = pytest.mark.unit

SPEC = PluginActionSpec(
    name="set_onoff",
    params={
        "device": ActionParamSpec(type="string"),
        "on": ActionParamSpec(type="boolean"),
        "note": ActionParamSpec(type="string", required=False),
    },
)

# Shared with the route tests: every one must be a 422 before plugin code runs.
BAD_PARAMS = [
    {"device": "d1"},  # missing required
    {"device": "d1", "on": "true"},  # string is not boolean
    {"device": "d1", "on": 1},  # int is not boolean
    {"device": "d1", "on": None},  # null is not boolean
    {"device": 5, "on": True},  # int is not string
    {"device": "d1", "on": True, "x": 1},  # unknown key
    {"device": "a" * (MAX_STRING_PARAM + 1), "on": True},  # too long
    {"device": "a" * 10_000, "on": True},  # a 10 kB string
    ["device"],  # not an object
    None,
]


def test_valid_params_pass_through():
    assert validate_action_params(SPEC, {"device": "d1", "on": True}) == {
        "device": "d1",
        "on": True,
    }


def test_optional_param_kept_when_given():
    assert validate_action_params(SPEC, {"device": "d1", "on": False, "note": "n"}) == {
        "device": "d1",
        "on": False,
        "note": "n",
    }


def test_string_at_limit_is_allowed():
    long = "a" * MAX_STRING_PARAM
    assert validate_action_params(SPEC, {"device": long, "on": True})["device"] == long


def test_returns_a_new_dict():
    raw = {"device": "d1", "on": True}
    out = validate_action_params(SPEC, raw)
    assert out == raw and out is not raw


def test_no_params_spec_accepts_empty_only():
    spec = PluginActionSpec(name="go")
    assert validate_action_params(spec, {}) == {}
    with pytest.raises(ActionParamsError):
        validate_action_params(spec, {"x": "y"})


@pytest.mark.parametrize("params", BAD_PARAMS)
def test_invalid_params_raise(params):
    with pytest.raises(ActionParamsError) as exc_info:
        validate_action_params(SPEC, params)
    assert exc_info.value.errors


def test_error_lists_do_not_echo_values():
    with pytest.raises(ActionParamsError) as exc_info:
        validate_action_params(SPEC, {"device": "secret-ish-value" * 30, "on": True})
    assert "secret-ish-value" not in " ".join(exc_info.value.errors)


def test_rate_limiter_allows_five_per_second_per_key():
    now = [0.0]
    rl = ActionRateLimiter(clock=lambda: now[0])
    assert all(rl.allow("a") for _ in range(5))
    assert rl.allow("a") is False
    assert rl.allow("b") is True
    now[0] = 1.01
    assert rl.allow("a") is True


def test_rate_limiter_drops_idle_keys():
    now = [0.0]
    rl = ActionRateLimiter(clock=lambda: now[0])
    for i in range(100):
        rl.allow(f"k{i}")
    now[0] = 5.0
    rl.allow("fresh")
    assert rl.tracked_keys() == 1


def test_refused_is_an_action_error():
    assert issubclass(PluginActionRefused, PluginActionError)
    err = PluginActionRefused("Can't be switched from here")
    assert err.message == "Can't be switched from here"
