# Overnight autonomous sprint plan — 2026-06-29

**Context:** User going to bed; granted autonomous execution with subagents (superpowers pipeline) to close multiple open issues. Branch `feat/design-settings-cycle-c` (PR #60). Push each completed, reviewed cycle. Acting as designer+approver; specs document decisions for morning review.

## Operating rules
- Preserve all data/behavior contracts: Pinia stores, API/service calls, `instance_config_schema` + `PluginFieldRenderer`, calendar/theme **data colors**, and the **FROZEN keyboard action vocabulary** (`useKeyboardActions.js` must not change). Rebuilds = UI/UX only; functionality preserved.
- Per cycle: brainstorm → spec (`docs/design/`) → plan (`docs/design/plans/`) → subagent-driven execution → per-task spec+quality review → whole-branch review → on-device screenshot → push to #60.
- New shell tokens/components only (no legacy tokens, no hardcoded hex except justified data colors). Stage explicit files only; NEVER stage `.beads/` or `frontend/public/test-calendar.ics`. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Subagents never push.
- Stop cleanly with a handoff on a genuine taste fork I can't responsibly resolve.

## Priority order (work top-down; do as many as the night allows)

### Phase 0 — Safe, clear-correct (high confidence)
1. **calvin-8ou (P1 bug)** — breadcrumb/section indicator unreliable. Root-cause hypothesis: the IntersectionObserver uses the VIEWPORT root + `rootMargin -70%`, but after the E3 sticky app-shell, sections scroll inside `.settings-content` (offset ~150px under fixed chrome), so the detection band is misaligned. Fix: set observer `root` to the `.settings-content` element + tune `rootMargin` relative to it. Verify on-device across categories. **DO FIRST.**
2. **ZIP-install no-restart alignment (the P3 from E2 review)** — `management.py` ZIP upload path: call `load_plugin_types_for_single(manifest["id"])` + return `requires_restart` from manifest `requirements.restart_required`. Small, fully specified.
3. **calvin-jat (P3)** — delete dead dashboard components (DashboardCategory + orphaned AppearanceTab/NotificationsTab/SettingsTab, etc.). VERIFY each is truly unreferenced before deleting; run suite.

### Phase 1 — Source-manager rebuilds (medium confidence; determinable pattern)
4. **Shared source-manager pattern + calvin-5io (image/services) + calvin-03m (calendar sources/refresh)** — design ONE shell-native source-list CRUD component (add/edit/remove/reorder; empty states; uses each domain's existing store actions), reuse for images, services, and calendar; calendar layers on per-source color (data color preserved) + refresh interval/refresh-now. Behavior preserved via existing stores.

### Phase 2 — Taste-heavy (lower confidence; build best-effort, morning review is the gate)
5. **calvin-svo (P2)** — installed-plugin browser rebuild (PluginManager/Card/Instances) shell-native. Preserve PluginFieldRenderer/schema forms, enable/config/test/uninstall/instances wiring. Flag prominently for review (user "unhappy" but cause unspecified — I'll pick a clean, defensible direction).
6. **calvin-1bp (P2)** — keyboard mappings editor rebuild, UI only, action set FROZEN.

## Notes
- calendar/image/services are all "source-list CRUD" → shared pattern decided (build once, reuse).
- PluginInstaller (1255-line install flow), DisplayScheduleGrid, UpdatesTab, ClockBar editors remain restyled-not-rebuilt candidates ("probably more") — not in this sprint unless time allows; leave beads.
- Progress tracked in `.superpowers/sdd/progress.md` (survives compaction).
