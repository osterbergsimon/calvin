# The Settings shell for screen readers (calvin-kajl M5, M9, M11, L8, L15, L18)

Review screenshots for PR 5 of the [frontend audit plan](../../2026-11-22-frontend-audit-plan.md),
the Settings top bar after its two hand-styled buttons became the shared
`Button` (M11).

Every shot is mocked data only (Playwright's API mock; nothing reached a real
Calvin server or host). Viewports: 390x844 (phone) and 1280x720 (a touch
kiosk-wide window, so the phone hand-off is offered). Themes: light, and
Backlit (`themeMode: "dark"`).

`before-*` is `origin/develop`; `after-*` is this branch.

| File | What it shows |
|---|---|
| `*-390-light-topbar.png` | The phone top bar: wordmark, Settings, save dot, Done |
| `*-390-backlit-topbar.png` | The same in Backlit |
| `*-1280-light-topbar.png` | The wide top bar: wordmark, section, save pill, **Use your phone**, **Done** |
| `*-1280-backlit-topbar.png` | The same in Backlit |

On a phone the hand-off stays hidden by the existing breakpoint rule; the other
visible change is the buttons' shared chrome, focus ring and 44px touch height.
Nothing else in the shell is visible: the rail's landmark/list structure, the
search results list and count line, the page's `<main>` and hidden `<h1>`, and
the title are for assistive technology.

Reproduce with:

```sh
cd frontend
E2E_PORT=5227 SR_SHOTS=<this directory> SR_STATE=after \
  npx playwright test --project=chromium settings-screen-readers
```
