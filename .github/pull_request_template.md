## Summary

<!-- What changes, and why. One short paragraph — the diff shows the how. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change (describe the migration below)
- [ ] Documentation only
- [ ] Refactor / performance / test / build

## Test plan

<!-- How you verified it. Commands you ran, what you did by hand, what a
     reviewer can repeat. Paste the pass/fail summary lines for the gates you
     ran; list any gate you did not run and why. -->

- [ ] `make lint`
- [ ] `make type-check`
- [ ] `make test`
- [ ] `make test-scripts` (if `scripts/` changed)
- [ ] Docs build: `uv run mkdocs build --strict --config-file ../mkdocs.yml`

**Steps to verify:**

1.
2.

## Screenshots / recording

<!-- Required for UI changes: before and after, light and dark theme, and a
     phone-width (390px) shot if the settings flow changed. Delete if not a UI
     change. -->

## Checklist

- [ ] One topic per pull request; no drive-by refactors
- [ ] Test added or updated (bug fixes include a test that fails without the fix)
- [ ] Documentation updated when behaviour, setup, or the plugin contract changed
- [ ] Plugins stay self-contained — no cross-plugin imports
- [ ] No secrets, personal hostnames, LAN IPs, or real credentials in code, tests, docs, or screenshots
- [ ] Backward compatible, or the breaking change and its migration are described above
