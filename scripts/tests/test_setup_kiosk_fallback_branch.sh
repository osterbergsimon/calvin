#!/usr/bin/env bash
# setup-kiosk.sh run on its own (no setup-common.sh beside it) downloads
# setup-common.sh from GitHub. main is release-only and far behind, so the
# fallback must track develop.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/alone"
cp "$here/../setup-kiosk.sh" "$tmp/alone/"
cat > "$tmp/bin/curl" <<CURL_EOF
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in http*) echo "\$a" >> "$tmp/curl.log" ;; esac; done
exit 22
CURL_EOF
chmod +x "$tmp/bin/curl"
(cd "$tmp" && env -u GIT_BRANCH -u GIT_REPO PATH="$tmp/bin:$PATH" \
    bash "$tmp/alone/setup-kiosk.sh" --backend-url http://h:8000) >/dev/null 2>&1 || true
grep -q 'raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup-common.sh' "$tmp/curl.log" \
    || { echo "FAIL: fallback did not fetch from develop: $(cat "$tmp/curl.log" 2>/dev/null)"; exit 1; }
echo "PASS"
