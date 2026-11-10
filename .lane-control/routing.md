---
lane_control_template: 1
max_rows: 40
read_by: coordinator, design lead, reviewer
---
How lanes are routed in this project. Route by the intelligence the work needs, cheapest first. Tiers: swift =
OpenCode with DeepSeek (hosted, sandboxed), the default; standard = Claude Sonnet; deep = Claude Opus. Claude is
only for the most qualified work, Sonnet before Opus. Tier by the paths a task touches: the highest tier wins, in
doubt one tier up. The budget decides how many lanes run, never the tier.

Swift: ordinary backend and frontend code, tests, prose docs, scripts without private data and CI. Swift may write a
failing test first. Swift never takes a task that needs private data or real credentials; a hosted model seeing this
public code is fine. Standard whatever the paths: a diagnosis (cause unknown), a cross-cutting refactor, an open
design question, a feature with subtle text or locale handling, a follow-up of a silent-loss or false-gate-claim
finding. Deep: the review-C paths and the files that steer agents. A PR touching a path above its lane's tier fails
review.

Reviews always run on Claude, whoever wrote the PR: a swift lane gets a standard (Sonnet) reviewer, a standard lane a
deep (Opus) reviewer, a deep lane a deep reviewer in a fresh session. This file overrides the shared model-routing.md
for this project. Review tiers, by what a PR touches, not by who wrote it. A: the coordinator's own checks only. B:
plus an independent review by a different model. C: plus a deep-tier review, and spec statements approved by the
owner before merge. Keep C for paths where a mistake really hurts (secrets, auth, data loss, the check that keeps bad
input out, sandbox and host settings) and name that harm in the row's why; ordinary code in a sensitive package is B.
The "in doubt one tier up" rule is for the model tier, not for the review letter.

## Path map
path glob | tier | review | why
--- | --- | --- | ---
backend/app/security/** | deep | C | auth bypass or leaked keys and setup codes
backend/app/api/routes/auth.py | deep | C | admin login
backend/app/api/routes/system.py | deep | C | reboots and restarts the host
backend/app/api/routes/backup.py | deep | C | restore can overwrite all data
backend/app/services/backup/** | deep | C | data loss and secrets in exports
backend/alembic/** | deep | C | migration can destroy the DB
backend/app/api/routes/share.py | standard | B | public share links expose content
backend/app/api/routes/security.py | deep | C | allowed origins and sealed mode: frames or origins let in, sealed mode turned off
backend/app/services/kiosk_*.py, backend/app/api/routes/kiosks.py | deep | C | forged kiosk bundle or leaked signing key
backend/app/services/theme_installer.py | standard | B | unpacks uploaded archives with extractall: path traversal
backend/app/services/validation/** | deep | C | gate for untrusted plugin packages
backend/app/plugins/** | standard | B | loader runs third-party code; plugin contract
backend/app/services/plugin_installer.py | deep | C | installs and pip-runs untrusted packages
backend/app/services/display_*.py | standard | B | acts on the display host
backend/app/mcp_server/** | standard | B | exposes tools to agents
backend/app/middleware/** | standard | B | security headers
backend/app/services/csp.py | standard | B | frame and CSP policy
backend/app/utils/ical_parser.py | swift | B | parses untrusted input
backend/app/database.py | standard | B | DB init and locking
scripts/*.sh | deep | C | runs as root on the Pi: sudoers, units, users
scripts/tests/** | swift | B | tests for host scripts
docker/** | standard | B | runtime image, entrypoint
.github/workflows/** | swift | B | CI and release flow; owner first
backend/tests/contract/** | swift | B | API contract snapshot
backend/** | swift | B | ordinary backend code
frontend/src/stores/auth.js | swift | B | client auth state
frontend/src/stores/security.js | swift | B | client security state
frontend/src/api/** | swift | B | generated types, do not hand-edit
frontend/public/sw.js | standard | B | service worker caching
frontend/** | swift | B | ordinary frontend code
docs/design/** | standard | B | owner design decisions
docs/** | swift | A | prose docs
CLAUDE.md, AGENTS.md | deep | B | prompts that steer agents
*.md | swift | A | prose docs
.lane-control/** | deep | B | steers other agents
.claude/** | deep | B | agent settings and skills
.agents/** | deep | B | agent skills
.gitignore | deep | C | keeps kiosk-signing.key, setup-code.txt, data/ and .env out of a public repo: a leak exposes the signing key and setup code
** | standard | B | default

## Deep whatever the paths, here
- Anything that changes the plugin contract (`api_version`, `PluginMetadata`, `SUPPORTED_DISPLAY_KINDS`): the separate
  calvin-plugins repo depends on it.
- Kiosk setup or update flow changes, even when only the tests are touched.
