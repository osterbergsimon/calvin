#!/usr/bin/env bash
# Tiny assertion helpers for the standalone scripts/tests/test_*.sh files.
# Sourced, never run: it lives in helpers/ so the CI `scripts/tests/*.sh` loop
# does not pick it up as a test.

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

assert_contains() {  # file pattern [message]
    grep -qE -- "$2" "$1" || fail "${3:-$1 does not match /$2/}"
}

assert_not_contains() {  # file pattern [message]
    if grep -qE -- "$2" "$1"; then fail "${3:-$1 unexpectedly matches /$2/}"; fi
}

# shellcheck disable=SC2016  # the quotes are part of the message
assert_eq() {  # expected actual [message]
    [ "$1" = "$2" ] || fail "${3:-expected '$1', got '$2'}"
}

assert_mode() {  # path octal-mode
    local got
    got="$(stat -c '%a' "$1")"
    [ "$got" = "$2" ] || fail "$1 has mode $got, expected $2"
}

# Put a stub command first on PATH. $1 = dir, $2 = name, $3 = body.
make_stub() {
    mkdir -p "$1"
    printf '#!/usr/bin/env bash\n%s\n' "$3" > "$1/$2"
    chmod +x "$1/$2"
}
