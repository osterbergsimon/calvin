# CLV-9 admin auth: UI spec

Status: ready to build. Source design: `~/.herdr-projects/reports/calvin/9/report.md` §3 and §4.
Mockups: [mocks/clv-9/admin-auth.html](mocks/clv-9/admin-auth.html). Rendered PNGs are in
[mocks/clv-9/png/](mocks/clv-9/png/) (`fig-N.png`, numbered in board order, A1 = fig-1 … C4 = fig-16).
The mock board uses the real `theme.css` tokens. Where this doc and the mock disagree, this doc wins.

## 0. Ground rules

- No new visual language. Build only from existing tokens (`--bg-*`, `--ink-*`, `--line*`, `--focus*`,
  `--ok/--warn/--err`, `--touch-target`, `--control-height`, `--space-*`, `--radius-*`, `--fs-*`)
  and existing components: `SettingsTopBar`, `SettingsSection`, `SettingRow`, `PhoneSetupCard`,
  `DialogScrim`, the `.security-btn` / `.security-btn--primary` button styles in `SecuritySettings.vue`,
  and `useNotificationsStore().notify` for toasts.
- The word is **Sign in / Sign out** everywhere. Never "log in" or "logout" in UI copy.
- One field type: a password. There is no username field anywhere visible (see §6, password managers).
- Copy in this doc is verbatim. Quotes, apostrophes (use ’ or ' consistently with the codebase: `'`), and
  full stops are part of the copy.
- Touch targets: every button and the Show toggle are at least `--touch-target` (44px) tall. Password
  inputs are `--control-height` (48px) tall.

## 1. New pieces (component map)

| Piece | Path | What it is |
|---|---|---|
| `PasswordField` | `frontend/src/components/ui/PasswordField.vue` | Label + `<input type=password>` + Show/Hide toggle + hint/error line. Used everywhere below. |
| `AuthLockScreen` | `frontend/src/components/settings/auth/AuthLockScreen.vue` | The Settings lock screen (setup and sign-in variants, §2). |
| `AdminSignInDialog` | `frontend/src/components/auth/AdminSignInDialog.vue` | The in-place dialog (§3). Mounted once in `App.vue`, driven by the auth store. |
| `AdminAccessSection` | `frontend/src/components/settings/categories/security/AdminAccessSection.vue` | Security tab additions (§4). |
| `useRateLimitCountdown` | `frontend/src/composables/useRateLimitCountdown.js` | Turns a 429 into a ticking `m:ss` string + `locked` boolean. Shared by all three forms. |

### PasswordField

Props: `modelValue`, `label`, `autocomplete` (`current-password` or `new-password`), `hint`, `error`,
`disabled`, `revealed` (v-model:revealed, so one toggle can drive two fields), `showToggle` (default true),
`inputId`.

- Input: full width, height `--control-height`, `padding: 0 4.75rem 0 0.875rem` (room for the toggle),
  `background: var(--bg-2)`, `border: 1px solid var(--line)`, `border-radius: var(--radius-sm)`,
  `font: 1rem var(--font-ui)` (1rem, not `--fs-control`: iOS zooms on inputs under 16px).
- Hover: `border-color: var(--focus-edge)`. Focus: `border-color: var(--focus)` +
  `box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 20%, transparent)`. This is the same as
  `.security-origins__input`.
- Error: `border-color: var(--err)`, `aria-invalid="true"`; the error text sits under the input in
  `--fs-sm` and `--err` and is linked with `aria-describedby`. The hint (if any) is in `--ink-2` and is
  replaced by the error while one shows.
- Show toggle: a text button inside the input on the right, `min-width: var(--touch-target)`,
  height = input height minus 4px, transparent background, `--ink-2`, `--fs-control` weight 500.
  Its label is **Show** or **Hide**. It has `aria-pressed` and `aria-controls` = input id, and
  `aria-label="Show password"` / `"Hide password"`. Toggling it keeps focus and caret in the input
  (`@mousedown.prevent`).
- Attributes: `autocapitalize="off" autocorrect="off" spellcheck="false"`. **Paste is always allowed**
  (never `@paste.prevent`), so password managers work (WCAG 2.2 3.3.8 Accessible Authentication).
- Focus: the input uses the focus ring above. The Show toggle and every button here get
  `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`, matching `.security-btn`.

## 2. Settings lock screen (`/settings`, not authenticated)

### Where it lives

`Settings.vue` renders `AuthLockScreen` *instead of* `.settings-body` while
`auth.status !== 'authenticated'`. `SettingsTopBar` stays and gets a new `locked` prop. When it is true,
the save pill and the "📱 Use your phone" button are hidden (the lock screen shows the phone hand-off
itself) and only the wordmark, the location label "Settings" and **Done** remain. Done returns to the
dashboard as it does today.

The search box and category rail are not rendered while locked. Deep links (`?setting=…`) are kept in
the URL and honoured after sign-in.

### Layout

- **Container:** the area below the top bar, `background: var(--bg-0)`, flex, centred both ways,
  `padding: 24px`.
- **Card:** `width: 26rem; max-width: 100%`, `padding: 2rem`, `background: var(--bg-1)`,
  `border: 1px solid var(--line)`, `border-radius: 16px` (same as `.settings-section__panel`). Contents are
  left-aligned.
  - Lock icon: 44px circle, `background: color-mix(in srgb, var(--focus) 14%, transparent)`,
    `color: var(--focus)`, 20px stroke lock glyph (inline SVG, `aria-hidden`), 16px below.
    Hidden when the viewport is narrower than 480px or shorter than 600px.
  - Title `<h1>`: `--fs-xl`, weight 600, `--font-ui`, line-height 1.3, 6px below.
  - Lead `<p>`: 0.95rem, `--ink-2`, line-height 1.45, 20px below.
  - Fields: 16px apart. Primary button: full width, `--control-height`, 1rem text, `.security-btn--primary` look.
  - Recovery block: 20px above, a 1px `--line-soft` rule, then 16px padding-top. `--fs-sm`, `--ink-2`,
    line-height 1.5. File and env names in `<code>` (`--font-data`, 0.85em, `--bg-0` chip, 4px radius).
- **Touch kiosk (`useTouchCapability().isTouch`):** a row of card, then the **"or" seam**, then
  `PhoneSetupCard` (default size, 200px QR). The seam is a vertical 1px `--line` rule broken by the word
  "or" (`--ink-3`, `--fs-md`), with `margin: 40px 32px`. The kiosk's own
  field is the main path: tapping it brings up the on-screen keyboard
  ([2026-10-29-on-screen-keyboard.md](2026-10-29-on-screen-keyboard.md) §6). The phone card is the
  alternative, and it is hidden while the keyboard is up.
- **Short kiosk (height < 600px, e.g. 800×480):** card `width: 22rem`, `padding: 1.25rem`, no icon,
  recovery block hidden, lead 12px below. `PhoneSetupCard compact`, stacked (QR above text), and
  `hint=""` so only title + URL show. Seam margin `24px 16px`. See A7.
- **Not touch (laptop/desktop):** card only, centred. No phone card.
- **Phone width (< 480px):** card full width with a 16px page gutter, aligned to the top (24px from the
  top bar), `padding: 1.5rem 1.25rem`, no icon. No phone card (they are *on* the phone). See A3 to A6.
- `isTouch` is true on a phone too. Decide between "kiosk" and "phone" on width: show the phone card only
  when `isTouch && viewport width ≥ 720px`.

### States

**S0. Checking.** While `GET /api/auth/status` is pending: render nothing for 300ms, then a centred
line "Checking…" in `--ink-2`, 0.95rem. No spinner.

**S1. Status failed (network error / 5xx).** The card shows (A8):
- Title: **Can't reach Calvin**
- Lead: **Settings can't check whether you're signed in. Check that the server is running and this device is on the same network.**
- Button: **Try again** (primary, full width). It refetches status. While refetching the label is
  **Checking…** and the button is disabled.
- No fields, no phone card, no recovery block.

**S2. Setup (`configured: false`)** (A1, A6)
- Title: **Choose an admin password**
- Lead: **Anyone on your network who knows it can change Calvin. The dashboard stays open to everyone.**
- Field 1: label **Password**, `autocomplete="new-password"`, hint **At least 8 characters.**, with the
  Show toggle. The toggle reveals *both* fields (`v-model:revealed` shared).
- Field 2: label **Repeat password**, `autocomplete="new-password"`, no toggle (`showToggle=false`).
- Button: **Set password**. While submitting: **Setting password…**, disabled, both fields disabled.
- Recovery footnote (always visible, not collapsible):
  **If you forget it, delete `admin-auth.json` from Calvin's data folder, or set `CALVIN_ADMIN_PASSWORD`, then restart Calvin.**
- Client validation never runs while typing. It runs **on blur of a non-empty field** (field 1: length;
  field 2: match) and again **on submit**, in this order:
  1. Password shorter than 8 characters (count code points: `[...value].length`): error on field 1,
     **Use at least 8 characters.**
  2. Fields differ: error on field 2, **The passwords don't match.**
  Focus moves to the first field with an error. Errors clear when that field next changes.
  Don't trim. Spaces and any characters are allowed.
- Success (`200`): the store sets authenticated. Settings renders normally at the deep-linked or last
  category. Toast (`notify`, type success): **Admin password set.**
- `409` (someone configured it first) → go to **S3 sign-in** with a warn banner in place of the lead
  (A5): **Someone else set the admin password a moment ago. Sign in with it, or ask them for it.**
  Clear the typed passwords. Focus the password field.
- `422` / `400` from the server (length rule disagreement): show the server's `detail` as the field 1
  error. Fallback: **Use at least 8 characters.**
- Network error: error banner above the button, **Couldn't reach Calvin. Check the connection and try again.**
  The fields keep their values.

**S3. Sign in (`configured: true`, not authenticated)** (A2 to A5)
- Title: **Sign in to Settings**
- Lead: **Enter the admin password for this Calvin.**
- Field: label **Admin password**, `autocomplete="current-password"`, Show toggle.
- Button: **Sign in** / while submitting **Signing in…** (disabled, field disabled).
- Recovery: a `<details>`, collapsed by default. Summary **Forgot the password?** (`--ink`, underlined,
  min-height `--touch-target`). Body:
  **Someone with access to the server deletes `admin-auth.json` from Calvin's data folder and restarts Calvin. Settings then asks for a new password. Or set `CALVIN_ADMIN_PASSWORD` and restart. That password always wins.**
- Empty submit: field error **Enter the admin password.** (no request sent).
- Wrong password (`401`, any code other than `admin_required`/`setup_required`): field error
  **That's not the admin password.** Keep the value, select it all, keep focus (A3).
- Rate limited (`429`): see §5. Error banner above the field (A4).
- Network error: same banner as S2.
- Success: same as S2, with no toast (signing in needs no announcement).

**Status changes underneath.** If status comes back `configured: false` while S3 shows (someone deleted
the file and restarted), the next submit gets `setup_required`. Switch to S2 with the warn banner
**Calvin's admin password was reset. Choose a new one.**

## 3. In-place sign-in dialog (401 `admin_required` outside the lock screen)

### Trigger

A response interceptor on the default axios instance **and** on `services/api.js`. On
`status 401 && data.code === 'admin_required'` it calls `auth.requestSignIn({ action })` and rejects the
original promise as usual, so the caller's own error handling still runs. The caller must not show its own
error toast for this case: give the rejected error a flag `err.adminRequired = true` that callers can
skip on. `data.code === 'setup_required'` opens the dialog in its no-password variant (D2).
The interceptor ignores 401s from `/api/auth/*` (those are form errors, §2).

`action` is derived from the request URL in one map in the auth store. That map is the only place copy
is chosen:

| Request | `verb` (title) | `gerund` (lead) | phone `settingId` |
|---|---|---|---|
| `POST /api/system/reboot` | reboot | Rebooting Calvin | `device-reboot` |
| `POST /api/system/update*` | update | Updating Calvin | `maintenance-updates` |
| anything else | continue | This change | `null` (Settings landing) |

Inside Settings (a session expired because the password was changed elsewhere), the same dialog opens
over Settings. Unsaved edits on screen are kept. Don't bounce to the lock screen.

Only one dialog at a time. Further 401s while it is open update nothing.

### Layout

- `DialogScrim blur` (z 999) + panel (z 1000), `role="dialog" aria-modal="true" aria-labelledby` = title.
- Panel: `background: var(--bg-1)`, `border: 1px solid var(--line)`, `border-radius: 14px`,
  `box-shadow: 0 18px 50px -16px var(--shadow-hover)`, `padding: 1.5rem`. This is the same look as `.settings-phone`.
- **Narrow (no phone card):** `width: min(30rem, calc(100vw - 32px))`, centred. At < 480px wide it sits at
  the bottom: `bottom: 16px`, centred horizontally (B2 to B4), so the phone keyboard pushes it up rather
  than covering it.
- **Touch kiosk (`isTouch && width ≥ 720px`):** `width: min(56rem, calc(100vw - 32px))`, `padding: 1.75rem`,
  3-column grid `1fr auto 1fr`: form, "or" seam (`margin: 8px 24px`), `PhoneSetupCard compact` stacked
  (QR above text) with `setting-id` from the action map (B1). Buttons stretch to equal width at
  `--control-height`.
- Buttons, right-aligned on narrow: **Cancel** (`.security-btn`) then the primary.

### States

**D1. Sign in** (B1, B2)
- Title: **Sign in to {verb}**. For "continue" the title is **Sign in to continue**.
- Lead: **{gerund} needs the admin password.**
- Field **Admin password** (as in S3).
- Buttons: **Cancel**, **Sign in** / **Signing in…**.
- Kiosk phone card: title **{Verb} from your phone** ("Continue from your phone" for the generic case),
  hint **Signing in on your phone doesn't unlock this screen. Open this address, sign in, and {verb} from there.**
  Generic hint: **Signing in on your phone doesn't unlock this screen. Open this address and sign in there.**
  *(Why: the cookie is per browser. Signing in on the phone grants the phone, not the kiosk. The QR must
  lead to where the action lives on the phone.)*
- Wrong password, empty submit, 429, network: exactly as S3, inside the dialog.
- Success: close the dialog, return focus to the element that was focused before it opened, toast
  (success): **Signed in. {Verb} again to continue.** (generic: **Signed in. Try again to continue.**).
  **Never auto-replay the request.** Reboot and update are destructive and the person should choose again.

**D2. No password set (`setup_required`)** (B3)
- Title: **No admin password yet**
- Lead: **{gerund} needs an admin password, and none has been set. Choose one in Settings first.**
- No field. Buttons: **Cancel**, **Open Settings** (routes to `/settings`, which shows S2).
- Kiosk: phone card as in A1 (title **Set it up from your phone**, `settingId` null).

**Dismiss:** Cancel, Escape, or a scrim tap. All three discard the typed password.

## 4. Settings › Security: Admin access

A new **first** section in `SecuritySettings.vue`: `<SettingsSection id="security-admin" title="Admin access">`,
above "Sealed mode". Add a registry destination `security-admin` (keywords: password, sign out, admin,
lock) so search and `?setting=security-admin` work.

Row 1, a `SettingRow`:
- Label: a 8px `--ok` dot + **Signed in on this device**
- Description: **Signing out here doesn't sign out other devices.**
- Control: **Sign out** (`.security-btn`). It calls `POST /api/auth/logout` and Settings immediately shows S3.
  No confirmation, because it is reversible. While pending: **Signing out…**, disabled. If it fails on the
  network, still clear local auth state and show S3 (the cookie is HttpOnly, so the server is the source
  of truth and the next status call settles it).

Row 2, a `SettingRow`:
- Label **Admin password**. Description: **Changing it signs out every other device.**
- Control: **Change password** (`.security-btn`). Tapping it expands the form below the row and hides
  this button. Focus moves to Current password.

Change form (inside the same panel, `padding: 0.25rem 1.25rem 1.25rem`, top rule `--line-soft`) (C1):
- Two `PasswordField`s side by side at ≥ 720px (`grid 1fr 1fr`, gap 16px, `max-width: 40rem`), stacked
  below:
  - **Current password** (`autocomplete="current-password"`, own Show toggle)
  - **New password** (`autocomplete="new-password"`, own Show toggle, hint **At least 8 characters.**)
- Buttons, left-aligned: **Cancel** (collapses the form and clears it), **Change password** (primary) /
  **Changing password…**.
- Validation on submit: empty current → **Enter your current password.**; new < 8 → **Use at least 8 characters.**;
  new === current → **Choose a password different from the current one.**
- Wrong current (`401` from `/api/auth/password` with a non-`admin_required` code): error on Current,
  **That's not the current password.**
- `401 admin_required` (this session was signed out meanwhile): the global dialog (§3) handles it, and the
  form keeps its values.
- 429: the §5 banner between the fields and the buttons. Fields and the primary button are disabled (C4).
- Success: collapse the form, show **✓ Password changed. Other devices were signed out.** in `--ok`,
  `--fs-md`, weight 500, `role="status"`, in the row's description area. It stays until you leave the tab
  (C3). This device stays signed in (the server re-issues its cookie).
- Phone width: `SettingRow` stacks (control full width, C2). While the form is open, hide both rows'
  descriptions to save height (C4).

## 5. Rate limit (429), shared

- The wait comes from the `Retry-After` response header (seconds). Fallback: `data.retry_after`, then 60.
  **Backend ask:** the login, setup and password endpoints must send `Retry-After` on 429.
- `useRateLimitCountdown(seconds)` exposes `locked` and `remaining` formatted `m:ss` (`0:47`, `2:00`,
  `15:00`). It ticks with `setInterval(1000)` against an absolute deadline (`Date.now() + s*1000`) so a
  background tab doesn't drift. It is cleared on unmount.
- UI: an error banner above the field(s) (above the buttons on the change form):
  **Too many wrong passwords. Try again in {m:ss}.** The banner `role="status"` updates the text each
  second, but the live region must not announce every tick. Put `aria-live="polite"` on a visually hidden
  copy that is set once at lock and once at unlock (**You can try again now.**).
- While locked: inputs and the primary button are disabled. Cancel and Show stay enabled. At 0 the banner
  disappears, the inputs re-enable, and focus returns to the password input.
- Banner style (also used for warn and network): flex, 12px 14px padding, `--radius-md`, 1px border,
  `--fs-md`, line-height 1.45.
  - err: `background: color-mix(in srgb, var(--err) 8%, var(--bg-1))`, `border-color: color-mix(in srgb, var(--err) 40%, transparent)`
  - warn: the same with `--warn`, 10% / 45%.
  - Text stays `--ink`. The colour is only in the tint and the border, so contrast holds in both themes.

## 6. Keyboard and accessibility

- Every variant is a real `<form>`; Enter submits. `KeyboardHandler` already ignores keydown in INPUT,
  so dashboard shortcuts won't fire while typing. Don't add exceptions there.
- Lock screen: on non-touch, autofocus the first field. On touch, do **not** autofocus: the kiosk's
  on-screen keyboard would pop up unasked and cover the phone card, and a phone would jump the page.
- Dialog: focus trap (Tab cycles inside). Initial focus on the password field on non-touch, and on the
  dialog title (`tabindex=-1`) on touch. Escape = Cancel. On close, restore focus to the opener.
- Password managers: each password form includes a visually hidden
  `<input type="text" name="username" autocomplete="username" value="admin" readonly tabindex="-1" aria-hidden="true">`
  so saved passwords attach to one consistent account. Nothing about it is visible.
- Errors: `aria-invalid` + `aria-describedby` on the field, and focus goes to the first invalid field.
  Banners use `role="status"` (warn) or `role="alert"` (network error). The 429 banner follows §5.
- The QR `<img>` keeps PhoneSetupCard's alt text. The URL stays as selectable text for screen readers.
- Settings UI-size zoom (`--ui-scale` on `.settings-page`) applies to the lock screen automatically. Check
  it at 1.25.
- Reduced motion: none of this animates except `DialogScrim`'s existing fade, which already respects it.

## 7. Notes for the coordinator / builders (found while designing)

0. **Kiosk typing depends on the on-screen keyboard spec** (its own issue). Until that lands, the kiosk
   variants still work through the phone card. Nothing in this spec has to wait for it.

1. **The dashboard ⋯ menu has no Reboot or Update today.** `AdminOverflow.vue` offers Settings, Lock layout
   and Hide controls. `regionsLocked` and `showUI` are display keys, so they stay public. The only
   dashboard-side admin action is the **keyboard reboot combo** in `KeyboardHandler.vue`, and it calls
   `fetch("/api/system/reboot")`, **not axios**, so the interceptor never sees its 401. Either move it to
   axios, or have it call `auth.requestSignIn({ action })` itself on a 401 `admin_required`. On a kiosk
   with no pointer, that dialog then needs the phone path (B1), which is exactly why it is there.
2. `Retry-After` on 429 (§5) is a backend requirement the report doesn't state.
3. The Settings › Security registry subtitle becomes **Admin password · allowed origins · network access**.
4. Tests (vitest): lock screen renders S2 vs S3 from status; 409 switches S2 → S3 with the banner; 429
   disables the form and the countdown reaches 0 and re-enables; interceptor opens the dialog for
   `admin_required` and not for `/api/auth/login` 401s; dialog never replays the request; the action map
   picks verb/settingId by URL.
