"""Route error responses must not leak exception text (calvin-225, audit S9).

The global 500 handler already returns a generic body for unhandled exceptions,
but many routes build ``HTTPException(detail=...)`` from the caught exception
themselves, which bypasses it. This guard walks the route modules:

* no server fault (500/502/503/504) may stringify an exception or interpolate
  one (``detail=str(e)``, ``detail=f"...{e}"``, ``detail=error_msg``, ...);
* every server fault must carry a coded body
  ``{"code": "<stable slug>", "message": "<user-facing text>"}`` so clients can
  branch on the code without parsing prose.

4xx details are deliberately exempt: a 400 may explain the caller's own input
(``str(ValueError)`` from a validator, an upstream HTTP status, ...).
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

ROUTES_DIR = Path(__file__).resolve().parents[2] / "app" / "api" / "routes"

# 500/502/503/504 mean "the server broke"; 501 is a deliberate capability answer.
SERVER_FAULT_STATUSES = frozenset({500, 502, 503, 504})

# Names that conventionally hold a caught exception (e, exc, cleanup_exc,
# error_msg, error_detail, ...). Matched per underscore-separated segment.
_EXC_SEGMENTS = frozenset({"e", "exc", "ex", "err", "error", "exception", "traceback", "stack"})
_EXCEPTION_NAME = re.compile(r"^(?:" + "|".join(sorted(_EXC_SEGMENTS)) + r")$", re.IGNORECASE)


def _is_exception_name(name: str) -> bool:
    return any(_EXCEPTION_NAME.match(part) for part in name.split("_") if part)


def _leaks_exception_text(node: ast.AST) -> bool:
    """True when the expression renders a caught exception into the response."""
    if isinstance(node, ast.Call):
        # str(e) / repr(exc) — but not str(status_code) style calls on plain values,
        # which the recursive Name check below already vets.
        if isinstance(node.func, ast.Name) and node.func.id in {"str", "repr"}:
            return any(_leaks_exception_text(arg) for arg in node.args) or not node.args
        return any(_leaks_exception_text(arg) for arg in node.args) or any(
            _leaks_exception_text(kw.value) for kw in node.keywords
        )
    if isinstance(node, ast.JoinedStr):
        return any(
            isinstance(value, ast.FormattedValue) and _leaks_exception_text(value.value)
            for value in node.values
        )
    if isinstance(node, ast.FormattedValue):
        return _leaks_exception_text(node.value)
    if isinstance(node, ast.Name):
        return _is_exception_name(node.id)
    if isinstance(node, ast.Attribute):
        return _leaks_exception_text(node.value)
    if isinstance(node, ast.Subscript):
        # result["error"] is exception text just as often as it is a plain value.
        return True
    if isinstance(node, ast.BinOp):
        return _leaks_exception_text(node.left) or _leaks_exception_text(node.right)
    if isinstance(node, ast.BoolOp):
        return any(_leaks_exception_text(value) for value in node.values)
    if isinstance(node, ast.Dict):
        return any(
            _leaks_exception_text(value) for key, value in zip(node.keys, node.values) if key
        )
    if isinstance(node, (ast.Tuple, ast.List)):
        return any(_leaks_exception_text(value) for value in node.elts)
    if isinstance(node, ast.IfExp):
        return (
            _leaks_exception_text(node.body)
            or _leaks_exception_text(node.orelse)
            or _leaks_exception_text(node.test)
        )
    return False


def _literal_status(call: ast.Call) -> int | None:
    for kw in call.keywords:
        if kw.arg == "status_code" and isinstance(kw.value, ast.Constant):
            if isinstance(kw.value.value, int):
                return kw.value.value
    if call.args and isinstance(call.args[0], ast.Constant):
        if isinstance(call.args[0].value, int):
            return call.args[0].value
    return None


def _detail_arg(call: ast.Call) -> ast.AST | None:
    for kw in call.keywords:
        if kw.arg == "detail":
            return kw.value
    if len(call.args) > 1:
        return call.args[1]
    return None


def _is_coded_detail(node: ast.AST | None) -> bool:
    """A server-fault detail must be a literal dict with a stable code + message."""
    if not isinstance(node, ast.Dict):
        return False
    pairs = {
        key.value: value
        for key, value in zip(node.keys, node.values)
        if isinstance(key, ast.Constant) and isinstance(key.value, str)
    }
    code = pairs.get("code")
    message = pairs.get("message")
    if not isinstance(code, ast.Constant) or not isinstance(code.value, str) or not code.value:
        return False
    return isinstance(message, (ast.Constant, ast.JoinedStr))


def _route_modules() -> list[Path]:
    return sorted(path for path in ROUTES_DIR.rglob("*.py") if path.name != "__init__.py")


def _offenders() -> list[str]:
    problems: list[str] = []
    for path in _route_modules():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        rel = path.relative_to(ROUTES_DIR.parents[2])
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            name = (
                func.id
                if isinstance(func, ast.Name)
                else func.attr
                if isinstance(func, ast.Attribute)
                else ""
            )
            detail = _detail_arg(node) if name.endswith("HTTPException") else None
            if name.endswith("HTTPException"):
                status = _literal_status(node)
                if status not in SERVER_FAULT_STATUSES:
                    continue
                if detail is not None and _leaks_exception_text(detail):
                    problems.append(f"{rel}:{node.lineno}: detail leaks exception text")
                elif not _is_coded_detail(detail):
                    problems.append(
                        f"{rel}:{node.lineno}: {status} detail is not {{code, message}}"
                    )
    return problems


def test_route_errors_do_not_leak_exception_text() -> None:
    problems = _offenders()
    assert not problems, "Leaky path responses:\n" + "\n".join(problems)


def test_guard_detects_the_patterns_it_claims_to() -> None:
    """Sanity-check the detector so the guard cannot silently pass everything."""
    leaky = [
        "raise HTTPException(status_code=500, detail=str(e))",
        'raise HTTPException(status_code=500, detail=f"Failed: {e}")',
        "raise HTTPException(status_code=500, detail=error_msg)",
        "raise HTTPException(status_code=500, detail=f\"Failed: {result['error']}\")",
        "raise HTTPException(status_code=503, detail=str(exc))",
    ]
    for source in leaky:
        tree = ast.parse(source)
        call = next(node for node in ast.walk(tree) if isinstance(node, ast.Call))
        detail = _detail_arg(call)
        assert _leaks_exception_text(detail), source

    clean = [
        'raise HTTPException(status_code=400, detail=f"Unknown plugin {plugin_id}")',
        "raise HTTPException(status_code=400, detail=str(status_code))",
    ]
    for source in clean:
        tree = ast.parse(source)
        call = next(node for node in ast.walk(tree) if isinstance(node, ast.Call))
        assert not _leaks_exception_text(_detail_arg(call)), source

    coded = ast.parse(
        "raise HTTPException(status_code=500, "
        'detail={"code": "thing_failed", "message": "Could not do it."})'
    )
    call = next(node for node in ast.walk(coded) if isinstance(node, ast.Call))
    assert _is_coded_detail(_detail_arg(call))
    assert not _is_coded_detail(ast.Constant(value="Could not do it."))
