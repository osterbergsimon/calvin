# Phone and kiosk end-to-end suite (CLV-66)

The phone is the setup device we tell people to use, so these tests treat
390x844 as a first-class layout. One run also covers an 800x480 touch kiosk.

```bash
# from frontend/
npm run test:e2e:phone
# a different dev-server port (so a running stack on 5173 is left alone):
E2E_PORT=5273 npm run test:e2e:phone
```

## What it covers

- first run (choose the admin password), sign-in, and opening Settings from
  the dashboard's ⋯ menu
- every Settings category: Content (calendars, photos, a web page through the
  picker), Dashboard, Screens (Default and one screen), Plugins, System,
  Security (API keys, admin password, allowed sites)
- the pages editor on a phone (CLV-47), including the inspector sheet
- the connection pill: unreachable, offline, and the recovery path

Every test fails on:

- horizontal overflow (`document.scrollWidth > innerWidth`, or any visible
  element past the edge that is not inside a deliberate horizontal scroller)
- controls that are covered, zero-sized or offscreen once scrolled to
- label text silently cut off (an ellipsis is allowed; clipping is not)
- console errors and uncaught exceptions

## The backend is mocked

`fixtures/api-mock.js` answers every `/api/**` request with sample data.
Nothing reaches a real Calvin server.

**Host-acting routes are always intercepted.** `/api/system/reboot`,
`/api/system/restart-*`, `/api/system/update`, `/api/system/reload-ui`,
`/api/system/display/*` and `/api/kiosks/*/update` have their own handlers,
registered after the catch-all so they win; each one records the call in
`api.hostActions` and returns a fake success. A test may therefore click
Restart or Update safely — and can assert the request was intercepted instead
of executed.

## Layout audits

`fixtures/phone-audit.js` exports `test` (adds a `consoleErrors` fixture) and
`expectPhoneLayout(page, label, { scope })`. It samples the layout for up to
~1.2s so a dialog's opening transition is not reported as overflow. Pass
`scope` to audit an open dialog or popover instead of the page behind it.
