#!/usr/bin/env bash
# systemd expands ${NAME} in Exec*= lines itself, before bash runs, and only
# understands ${NAME}, ${NAME:-default} and ${NAME:+alt}. Anything else, e.g.
# "${CALVIN_BACKEND_URL%/}" or a shell-local "${q}", becomes an EMPTY string
# (verified on systemd 260: "Invalid environment variable name evaluates to an
# empty string"). Shell-side expansions must be written $${...} (and % as %%).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=helpers/assert.sh
. "$HERE/helpers/assert.sh"

bad=0
for unit in "$REPO"/deploy/systemd/*.service; do
    # Exec lines with their backslash continuations joined.
    exec_text="$(awk '
        /^Exec[A-Za-z]*=/ { inexec = 1 }
        inexec { print; if ($0 !~ /\\$/) inexec = 0 }
    ' "$unit")"
    # Every ${...} not written as $${...}.
    while IFS= read -r ref; do
        [ -n "$ref" ] || continue
        # shellcheck disable=SC2016  # matching the literal text "${"
        case "$ref" in
            '${'[A-Z_]*) ;;
            *) echo "$(basename "$unit"): unescaped shell expansion $ref"; bad=1; continue ;;
        esac
        name_and_op="${ref#\$\{}"
        if ! printf '%s' "$name_and_op" | grep -qE '^[A-Z_][A-Z0-9_]*(\}|:-|:\+)'; then
            echo "$(basename "$unit"): systemd would empty $ref (use \$\${...})"
            bad=1
        fi
    done < <(printf '%s\n' "$exec_text" | grep -oE '(^|[^$])\$\{[^}]*\}?' | sed -E 's/^[^$]//')
done
[ "$bad" = 0 ] || fail "unit files contain expansions systemd would blank out"
pass "no Exec line relies on a shell expansion systemd would blank out"
