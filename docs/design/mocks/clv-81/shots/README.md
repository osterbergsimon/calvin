# Security and System — doctrine migration screenshots

Before/after captures for CLV-81 (frontend doctrine phase 2, the Security and
System categories). Taken against the mocked backend in
`frontend/tests/e2e/phone/fixtures/api-mock.js` (no owner data, no host action
ever reaches a real machine), at 1280 and 390 wide.

| File | What it shows |
|---|---|
| `security-1280-*.png` | Settings › Security: admin access, API keys, sealed mode, allowed sites |
| `security-1280-lower-*.png` | Settings › Security scrolled to the allowed-sites editor |
| `security-390-*.png` | Settings › Security on a phone |
| `system-1280-*.png` | Settings › System: updates, versions, restart |
| `system-1280-lower-*.png` | Settings › System scrolled to backup, restore and automatic backups |
| `system-390-*.png` | Settings › System on a phone |
| `signin-1280-*.png` | The in-place admin sign-in dialog |
| `signin-390-*.png` | The in-place admin sign-in dialog on a phone |

`*-before.png` is `origin/develop` at `49f91e84`; `*-after.png` is this branch.
