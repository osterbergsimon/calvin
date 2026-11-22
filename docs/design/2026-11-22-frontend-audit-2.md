# Frontend audit 2: load speed, images, motion and security (calvin-4hb8)

Status: report and plan. Report only; no product code changed. It covers what the first audit
([2026-11-22-frontend-audit-plan.md](2026-11-22-frontend-audit-plan.md), M1-M16, L1-L25, O1-O4) left out: Core
Web Vitals, image loading, `content-visibility`, view transitions, scroll-driven animation, container queries, and
security (sanitization, iframes, CSP). None of the first audit's findings are repeated here.

Method: the `modern-web-guidance` guides `performance`, `optimize-image-priority`, `defer-rendering-heavy-content`,
`sanitize-untrusted-html`, `security`, `motion`, `same-document-transitions`, `size-aware-styling`,
`efficient-background-processing` and `deprioritize-background-fetches` were read, and Calvin was judged against each
by reading the code at `origin/develop` (branch base). One measurement: `npm ci && npm run build` (bundle sizes
below). **No Lighthouse or Playwright trace and no Pi run were done**, so every runtime cost below is reasoned from
the code, not measured. Findings that need a Pi measurement before the fix are marked *measure first*.

Overall: Calvin is already in good shape on load speed. The shell is route- and region-split, photos are requested at
a width bucket and decoded before the swap, the service worker keeps full-size photos out of its cache, effects that
need a GPU are gated by the effects level, and there is a bundle budget. The weak area is **security of framed and
plugin content**, where the kiosk is hardened and every other client is not. **Must-fix findings: 3 (S1, S2, P1).**

## What is already right (no finding)

- Bundle: initial dashboard JS is **485.5 kB raw / 171.3 kB gzip** and initial CSS **102.5 kB / 30.0 kB gzip**, with
  Settings, plugin renderers, drag-and-drop and the on-screen keyboard kept off first paint by
  `scripts/check-bundle-budget.mjs`. Brotli for the whole dist is 457 kB. (`npm run build`, 1.2 s.)
- Photos: `utils/imageVariants.js` buckets requests to 640-2560 px, `PhotoSlideshow.vue:333-348` preloads and decodes the
  next photo before swapping, and `decoding="async"` is set. This replaces `srcset`/`sizes`, which would not help
  because the wall renders one image at one size.
- No `v-html`, `innerHTML`, `insertAdjacentHTML` or `setHTML` anywhere in `frontend/src`. Calendar titles and plugin
  text are interpolated, so the Sanitizer API guide has nothing to fix today (see S4 for a guard).
- Effects: the 28 px photo blur (`PhotoSlideshow.vue:598`) and the dialog `backdrop-filter`
  (`ui/DialogScrim.vue:31-34`) both sit under `[data-effects="full"]`, so Standard never pays for them.
- Caching: the SW is network-first for pages and API, cache-first for hashed assets, and excludes SSE and full-size
  images (`public/sw.js:54-55`); `/assets/*` is `immutable` (`frontend_static.py:22`). This matches the guide.
- Timers: polling uses `setInterval` at 60 s and up (`CalendarView.vue:541,587`, `Dashboard.vue:619`). A wall is
  always visible, so `useIntervalWhenVisible` and `priority: "low"` fetches would buy nothing.
- Kiosk CSP (`services/csp.py`): `default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `base-uri`,
  `form-action`, `frame-ancestors 'self'`, with frame origins listed per configured service.

## Security (S)

### Must-fix

**S1. Framed pages are unsandboxed or over-privileged on every non-kiosk client.**
- `components/service/IframeViewer.vue:7`: `:sandbox="onKiosk ? kioskSandboxFor(frameSrc) : undefined"`. On a phone or
  desktop browser the service iframe has **no sandbox at all**: it can navigate Calvin (`top.location`), open
  popups, and, for a same-origin URL, read `parent`.
- `components/plugins/renderers/IframeRenderer.vue:96-98`: off the kiosk the sandbox is the fixed string
  `allow-scripts allow-same-origin allow-forms allow-popups`, whatever the URL. With `allow-scripts` plus
  `allow-same-origin` on a **same-origin** URL the framed page can remove its own sandbox and run as Calvin. The URL
  comes from `schema.url` or `schema.url_path` resolved against fetched plugin data (`:87-90`), checked only by
  `isHttpUrl` (`utils/safeUrl.js:4`, scheme only). A plugin whose data feed returns `/api/...` or `/` gets a
  same-origin frame with full authority, in the admin's browser.
- Why it matters: the kiosk is protected (`utils/kioskSandbox.js` already drops `allow-same-origin` for own-origin
  frames), but Settings and setup run on phones, where the admin session lives. The kiosk-only guard is the wrong
  axis; the right one is the frame's origin.
- Fix: one helper for both components. Always `kioskSandboxFor(url)` (own origin loses `allow-same-origin`; foreign keeps
  it for cookies); off the kiosk add `allow-popups allow-popups-to-escape-sandbox` only. Keep `referrerpolicy` (the
  Renderer has `no-referrer`, the Viewer has none: add it). Add a unit test per branch (own origin, foreign origin,
  kiosk, phone) in the existing `kioskSandbox` tests.

**S2. No `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy` on normal responses.**
- `backend/app/middleware/security_headers.py:57` sets only the CSP. `Referrer-Policy: no-referrer` exists only on the
  share page (`services/frontend_static.py:224`). `grep` finds no `nosniff` in `backend/app`.
- Why it matters: `/api/images/*` serves operator and guest uploads with a `media_type` from the stored format
  (`routes/images.py:255-292`). Without `nosniff` a browser may sniff a mislabelled upload as HTML on the Calvin
  origin. Without a referrer policy, an embedded service or a plugin link can receive Calvin's page URL, which can
  carry a setup link. Cheap to fix, high value.
- Fix: add `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` (the share page keeps `no-referrer`),
  and `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` in the same middleware, for
  non-exempt paths. Keep `/docs`/`/redoc` exempt only from CSP, not from nosniff. Tests: header assertions in the
  existing middleware tests, including the exempt path and the sealed branch.

### Later

**S3. CSP tightening (report-only first).** `services/csp.py:14-24`: no `object-src` (it falls back to
`default-src 'self'`, so a same-origin `<object>` is allowed; set `object-src 'none'`), `style-src 'unsafe-inline'`
(Vue scoped styles; keep and document), no `Trusted Types`. The security guide's phase 3.3 enforces Trusted Types
with `require-trusted-types-for 'script'`; with no HTML sinks in the frontend (S4) that is cheap, but **WebKit
(WPE) is the laggard on Trusted Types**, so ship it as `Content-Security-Policy-Report-Only` or skip it on WebKit
user agents, and keep `object-src 'none'` as the only enforced addition. Needs the owner to decide report-only vs
none, since there is no reporting endpoint.

**S4. Guard the "no HTML sinks" property.** A lint rule (`vue/no-v-html` as an error, `no-restricted-properties`
for `innerHTML`/`outerHTML`/`insertAdjacentHTML`) in `eslint.config.*` keeps calendar and plugin text on the safe
path. If a renderer ever needs markup, the Sanitizer API guide says `el.setHTML()`; WebKit lacks it, so
feature-detect and fall back to text.

**S5. Plugin-supplied image and module URLs.**
- `components/plugins/renderers/ImageWithCaption.vue:4,30`: `<img :src>` from plugin data with no scheme check. CSP
  `img-src 'self' data:` contains it, but an allowlisted admin origin widens it. Run it through `isHttpUrl` or a
  same-origin relative check like the iframe renderer.
- `components/plugins/WebComponentHost.vue:36,57`: `pluginId` and `schema.module` are interpolated into
  `import(...)` unencoded. The backend route constrains them, but encode (`encodeURIComponent`) and reject `..` as
  defence in depth. Web-component code runs with the app's origin by design (documented escape hatch); say so in
  `PLUGIN_FRONTEND_COMPONENTS.md` rather than treat it as a bug.

## Performance (P)

### Must-fix

**P1. The first photo is the LCP and nothing tells the browser so.**
- `PhotoSlideshow.vue:66-100`: the main `<img>` and its backdrop image(s) all carry `loading="eager"` and no
  `fetchpriority`, so all of them (up to two copies of the same 1920-2560 px JPEG in Full effects) request at the
  same priority, and the photo that paints first competes with its own decorative blur.
- Why it matters: on a Pi 3B+ the first frame after boot or a reload is the photo; every extra concurrent decode of a
  large JPEG delays it, and the link may be Wi-Fi. This is the guide's `optimize-image-priority` case.
- Fix: `fetchpriority="high"` on `.photo-image` only; `fetchpriority="low"` on both backdrops; leave the preload
  `new Image()` as is. Use `backdropImageUrl` (the 640 px bucket) for the Full backdrop too (it is already used for
  Standard, `:232`), because a 28 px blur of a 2560 px source shows no extra detail. The fix is three attributes and
  one computed. *WebKit (WPE): `fetchpriority` is Safari 17.2+; older WPE ignores it harmlessly, the backdrop change
  still helps.* Tests: one component test per attribute and per `effects` level.

### Later

**P2. Progressive JPEG variants are the costlier decode on a Pi.** `services/image_variant_cache.py:32,129` saves
`progressive=True, optimize=True`. A slideshow that preloads and decodes before swapping never shows the
intermediate scans, and progressive decode needs more memory and several passes. Switch the variants to baseline
(`progressive=False`), keep `optimize=True`, and *measure first* on a 1 GB Pi (decode ms and RSS for 1920 and 2560).
WebP/AVIF through `<picture>` is **not** recommended: it needs different URLs, and software WebP/AVIF decode is
slower than libjpeg-turbo on ARM. Owner decision only if the measurement shows a gain under about 10 percent.

**P3. Missing intrinsic size on small images (CLS on a phone).** `views/GuestShare.vue:106` (lazy thumbnails),
`settings/shared/LocalPhotosBrowser.vue:101-105`, `plugins/renderers/ImageWithCaption.vue:4`, and the icon images in
`PluginInstaller.vue:46` and `ProviderPicker.vue:24,68` have no `width`/`height`. Check the CSS first; where an
`aspect-ratio` or fixed box already exists, do nothing. Elsewhere add the attributes. The wall has no CLS risk: the
slideshow container is measured before any `src` is set (`PhotoSlideshow.vue:66`).

**P4. The shell is blank until JS runs.** `index.html:15` is an empty `#app`; first paint waits for the entry chunk
(121.6 kB raw) plus six shared chunks (485.5 kB raw). On a Pi 3B+ that is the LCP floor for the dashboard.
Inline `body{background:#0e1316}` (matches `theme-color`) so boot never flashes white, and consider
`<link rel="modulepreload">` for the vendor chunks only if a trace shows serial discovery (Vite already preloads
the static graph, so likely not). *Measure first.*

**P5. Dead and misnamed bits.** `index.html:13` is `<link rel="preconnect" href="/api">` to the same origin, which
does nothing; remove it. The chunk named `vendor-query` (120 kB) actually holds the Vue runtime (`@vue/runtime-core`,
`runtime-dom`) next to `@tanstack/vue-query`, `vendor-vue` is only 30.7 kB, and a 96 kB chunk called
`useTouchCapability` holds ten stores and utils, so names mislead anyone reading a trace. Fix the `manualChunks`
regex at `vite.config.js:163` (the `@vue/` and `vue-demi` match fails for pnpm/npm layouts that nest paths); no size
win, only legibility. Low value; fold into any PR touching `vite.config.js`.

**P6. Caching of variants.** `routes/images.py:142` sends variants with `max-age=3600` and an ETag, so a wall that
cycles a few hundred photos revalidates each one hourly. Reasonable and safe; raising it needs a version in the
URL or an immutable-by-id guarantee, which is a backend decision. Judged: leave, note only.

### Judged, no finding

- **`content-visibility`** (guide `defer-rendering-heavy-content`): the guide says not to apply it to small or simple
  pages. The month grid is at most 42 cells (`CalendarView.vue:117-197`), the week view fewer, and Settings lists are
  short. No candidate; adding it would only risk scrollbar jumps. Re-check if an agenda or long event list appears.
- **INP**: handlers are click/key driven and small; no long loops found in `KeyboardHandler.vue` or the stores. Not
  measured; add to a later trace pass.

## Motion (V)

**V1. View transitions: do not adopt on the wall.** The photo swap is an opacity transition on the `<img>`
(`PhotoSlideshow.vue:607`), which is on the compositor and cheap. `document.startViewTransition()` would snapshot a
full-screen layer into a pseudo-element tree, roughly doubling GPU memory at the moment of the swap, on a 1 GB Pi.
*WebKit (WPE) needs a WebKitGTK/WPE new enough for same-document view transitions (Safari 18 level); unverified on
the shipped cog.* Keep the opacity fade. If the owner ever wants a phone-only polish for Settings navigation, feature
detect and `prefers-reduced-motion`-gate it; not recommended now.

**V2. Scroll-driven animation: no use.** Walls do not scroll, and Settings has no scroll-linked effect. Nothing to
adopt; do not add `animation-timeline` for decoration. *WPE lacks it until recent WebKit regardless.*

**V3. Reduced motion is already handled in 26 files**; first audit M-series covers the rest. No finding.

## Container queries (C)

### Later

**C1. The calendar responds to the viewport, not to its region.** `CalendarView.vue:2108,2158,2198,2239` use
`--bp-phone`, `orientation` and `max-height` media queries, but the calendar can sit in a split region
(`DashboardRegion.vue:177`) whose size is not the viewport's. Only two components (`ui/EmptyState.vue:170`,
`ui/FieldTable.vue:57`) use container queries. A half-width calendar on a 1280 px screen gets desktop rules in a
phone-sized box.
- Fix: make `DashboardRegion` a `container-type: size` (the `EmptyState` pattern already works under WPE) and move
  the four calendar queries and the plugin renderers' fixed-column grids to `@container`. Keep the media queries as
  the fallback. *Container size queries are Safari 16+; WPE older than that falls back to the media rules.*
- Needs screenshots at 800x480 and 1280 in split layouts. Tests: a component test per layout with a stubbed
  container width is not possible in jsdom; use the e2e screenshots.

## Sequencing into PRs

Same rules as the first audit's plan: follow the doctrine, copy in **bold** is exact (none changes here), screenshots
from the mocked harness at 390 and 1280, light and Backlit, plus 800x480 for the wall. A PR marked *shared block*
changes `components/ui/`, `base.css`, `theme.css` or `main.css`.

| # | PR | Findings | Shared block | Owner |
|---|---|---|---|---|
| 1 | Frame sandbox on every client | S1 | no | — |
| 2 | Response security headers | S2, S3 (`object-src`) | no | S3 report-only? |
| 3 | First photo priority | P1 | no | — |
| 4 | Plugin URL hygiene and HTML-sink guard | S4, S5 | no | — |
| 5 | Photo variants decode cost | P2 | no | maybe |
| 6 | Image sizes and head | P3, P4, P5 | no | — |
| 7 | Region container queries | C1 | maybe (only if the rule lands in `main.css`) | — |

### PR 1. Frame sandbox on every client (S1)
- **Why:** an unsandboxed or same-origin-scripted frame can run as Calvin or take over the page.
- **Fix:** one helper in `utils/kioskSandbox.js` used by `IframeViewer.vue:7` and `IframeRenderer.vue:96`; off the
  kiosk it adds popups only; add `referrerpolicy="no-referrer"` to the Viewer.
- **Tests:** unit tests for own origin, foreign origin, kiosk, phone; component tests that both iframes render the
  helper's output.
- **Screenshots:** a web service and an iframe plugin on the wall (800x480) and phone (390); behaviour unchanged.
- **Shared block:** no.

### PR 2. Response security headers (S2, S3 `object-src`)
- **Why:** uploads served on the Calvin origin should not be sniffable; links should not leak URLs.
- **Fix:** `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` in `security_headers.py`; add
  `object-src 'none'` to `_BASELINE`.
- **Tests:** middleware tests for normal, exempt (`/docs`), sealed and failure paths; keep the byte-identical baseline
  test updated; a contract test is not affected.
- **Screenshots:** none (no visible change).
- **Shared block:** no. **Owner:** only to decide whether a report-only Trusted Types policy is wanted (S3).

### PR 3. First photo priority (P1)
- **Why:** the first photo is what the wall shows after boot.
- **Fix:** `fetchpriority` high/low as above; Full backdrop uses `backdropImageUrl`.
- **Tests:** component tests on attributes and `src` at both effects levels.
- **Screenshots:** Standard and Full effects at 800x480, before and after (backdrop should look identical).
- **Shared block:** no.

### PR 4. Plugin URL hygiene and HTML-sink guard (S4, S5)
- **Why:** keeps the safe-by-construction property true as plugins grow.
- **Fix:** lint rules; scheme check in `ImageWithCaption.vue`; encode in `WebComponentHost.vue`; doc line in
  `PLUGIN_FRONTEND_COMPONENTS.md`.
- **Tests:** lint passes; tests for a `javascript:` and a `//host` image URL.
- **Screenshots:** none. **Shared block:** no.

### PR 5. Photo variants decode cost (P2), measure first
- **Why:** less CPU and RAM per photo on a 1 GB Pi.
- **Fix:** baseline JPEG variants if the measurement agrees.
- **Tests:** variant cache tests that sizes stay within the pixel budget and output is a baseline JPEG.
- **Screenshots:** none. **Shared block:** no. **Owner:** yes if the Pi measurement is within noise, since it
  needs a kiosk run this audit was not allowed to do.

### PR 6. Image sizes and head (P3, P4, P5)
- **Why:** no layout jump in the phone grids; a clean head; honest chunk names.
- **Fix:** `width`/`height` where CSS has no box; inline dark `body` background; remove the same-origin preconnect;
  fix the `manualChunks` pattern.
- **Tests:** `npm run build` budget check still passes and the chunk names change; unit test for `index.html`.
- **Screenshots:** guest share and local photos grids at 390.
- **Shared block:** no.

### PR 7. Region container queries (C1)
- **Why:** a calendar in half a screen should lay out for half a screen.
- **Fix:** `container-type` on the region; move the four calendar queries to `@container`, keep media fallbacks.
- **Tests:** e2e screenshots in single and split layouts.
- **Screenshots:** 800x480 and 1280, split and full, light and Backlit.
- **Shared block:** yes if the container rule lands in `main.css`; then the UI gallery before and after.

## Needs the owner

- **S3:** report-only Trusted Types or none (no reporting endpoint exists).
- **P2:** whether to accept a Pi measurement (kiosk run) before changing the JPEG encoder.

## Also noticed

- `docs/design/2026-11-22-frontend-audit-plan.md` L21/L25 already cover head and fonts; PR 6 here avoids them.
- Nothing was measured on a Pi or in a traced browser; a follow-up lane with a mocked-harness Lighthouse run and a
  Pi `profile-kiosk.mjs` run (the script already exists in `frontend/scripts/`) would turn the *measure first*
  items into numbers.
