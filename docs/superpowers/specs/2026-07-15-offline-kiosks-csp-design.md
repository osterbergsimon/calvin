# Offline Kiosks — CSP-Enforced Single Attack Surface

**Status:** Design / approved for planning
**Date:** 2026-07-15
**Branch:** `feature/offline-kiosks` (based on `develop`)
**Related:** epic `calvin-dd9` (per-device/per-kiosk settings, Mode B), `calvin-ks7` (kiosk-safe handoff overlay), `calvin-dd9.7` (SSE push channel)

## Goal

Guarantee that a Calvin **kiosk browser only ever connects to its Calvin server**
(`'self'`) plus an explicitly declared whitelist. This makes the Calvin server the
single internet-facing component ("one attack surface toward the internet"), and the
guarantee is **enforced by the browser via Content-Security-Policy** — not by code
review or plugin-author discipline.

This is the **attack-surface** framing, chosen deliberately over the alternative
"kiosk survives the server being unreachable" (resilience) framing. Resilience /
offline-snapshotting is explicitly **out of scope** (see Non-goals).

## Guiding principle: "remote" = "not `self`"

The browser has no concept of LAN vs. internet. `grafana.lab.example.com` and
`api.met.no` are both simply "an origin that is not Calvin." Split-horizon DNS, VPNs,
and reverse-proxied intranet domains make host-based "internal vs. external"
classification unenforceable at the browser layer.

Therefore Calvin does **not** classify remoteness by network topology. It trusts
exactly one origin — the Calvin server (`'self'`) — and treats **everything else as
external by definition**, intranet services included. The only ways a resource
reaches the kiosk browser are: (a) served by Calvin (so it is `self`), or (b) its
origin is on an explicit, admin-visible whitelist. CSP's `'self'` is the only line
that is actually browser-enforceable, which is what makes "one attack surface" a
provable property rather than a hopeful one.

## Current state (audit, on `develop`)

Almost all external fetching is **already backend-side** — the server calls the
external API and the kiosk hits `/api/*`. The remaining kiosk→internet leaks are
narrow:

| # | Source | Status | Notes |
|---|--------|--------|-------|
| 1 | `frontend/src/stores/images.js` (~L161–167) returns raw remote CDN URL (`image.url`/`raw_url`) to `<img src>` for picsum/unsplash/nasa-apod/immich | **Live leak** | The server proxy `GET /api/images/{id}` **already exists** and caches via `remote_image_cache`. The frontend just bypasses it for remote images. |
| 2 | `frontend/index.html` `<link rel="dns-prefetch" href="https://openweathermap.org">` | Live (minor) | Deprecated OpenWeatherMap legacy. Delete. |
| 3 | `frontend/src/components/WeatherWidget.vue` (L14, L62) OpenWeatherMap icon CDN | **Dead code** | Imported nowhere. Deprecated legacy. Delete. |

### Already clean

- **All plugin *data* fetching is backend-side** (yr_weather→met.no, sl_departures→SL,
  mealie→instance, calendars, image scans). The kiosk never calls these.
- **yr_weather** renders weather icons as **local emoji glyphs** (`_glyph`), no CDN.
- **Fonts** are self-hosted in `frontend/src/assets/fonts/` (OFL), no Google Fonts.
- **Web-component plugin bundles** (chromecast, test-plugin) contain no external refs.

### Cross-origin *browser* consumers that exist today (need whitelisting)

- **Built-in web-service embeds.** Calvin ships a built-in `iframe` service
  (`WEB_EMBED_PLUGIN_ID = "iframe"` in `stores/webServices.js`), rendered by
  `WebServiceViewer.vue` / `components/service/IframeViewer.vue`. Users add a web
  service by URL; it renders in an iframe pointing at that (cross-origin) URL. This
  is a **first-class feature** and the primary cross-origin consumer.
- **Service-plugin handoff / iframe links.** `CardGrid`/`ItemList` open a plugin
  `click_url` via `HandoffOverlay`; the `IframeRenderer` renders a plugin `url`.
  These are `frame-src` consumers governed by the same whitelist.
- **chromecast.** Browser-native Cast: loads its SDK from gstatic and discovers
  devices via mDNS **browser↔device**. **Cannot be proxied.** The one genuinely
  hard plugin.

### Per-plugin matrix ("which plugin needs what")

| Plugin(s) | Browser-side external need | Handled by |
|---|---|---|
| picsum, unsplash, nasa-apod, immich, image-processor | image bytes | existing `/api/images/{id}` proxy — route through it |
| yr_weather, sl_departures, system-monitor, imap, calendars | none (local glyphs / text) | already `self` |
| built-in web-service `iframe` | user-configured service origin | `frame-src` auto-derived from service config |
| service-plugin handoff/iframe links | link origin (often the plugin's own service) | same `frame-src` whitelist |
| **chromecast** | Cast SDK origin + browser-native discovery | declares `browser_origins`; **off in sealed mode** |

## Design

### 1. Strict CSP served by FastAPI (the enforcement backstop)

FastAPI serves a Content-Security-Policy header (and/or `<meta>` equivalent) on the
SPA response:

```
default-src 'self';
img-src 'self' data:;
connect-src 'self';
font-src 'self';
frame-src 'self' <derived + whitelisted origins>;
style-src 'self' 'unsafe-inline';   # see implementation risk below
script-src 'self';
```

- The policy is **generated dynamically** from current configuration, because
  `frame-src` depends on the currently-configured web-service instances and enabled
  plugins. It cannot be a static string. Regenerate on the response that serves
  `index.html` (and refresh when config changes).
- **Effective policy** =
  `'self'`
  + Σ(enabled plugins' declared `browser_origins`)
  + system allowlist (admin manual entries)
  + auto-derived origins from configured web-service instance URLs.

**`frame-src` coverage.** Web-service embeds, `HandoffOverlay` links, and
`IframeRenderer` all read from `frame-src`:
- Handoff/iframe to the plugin's **own configured service origin** → auto-derived
  from the service instance config → works with no extra setup.
- Handoff/iframe to an **off-whitelist origin** → blocked by CSP; must **degrade to
  the kiosk-safe handoff error overlay** (`calvin-ks7`), not a broken frame. In
  sealed mode this is the intended behavior.

### 2. Whitelist model — two sources, split by who knows the origin

- **Plugin manifest — `browser_origins: []`** (new, optional, default empty).
  Origins **intrinsic to the plugin**, known by the author, identical for every user
  (e.g. chromecast's Cast SDK origins). Ships with the plugin. Validated at load.
  Default empty = the plugin promises the kiosk only talks to Calvin.
- **System settings — admin allowlist.** *Site-specific* origins only the operator
  knows (their self-hosted services). Two sub-sources:
  - **Auto-derived** from configured web-service instance URLs (no double entry — if
    you added the service, its origin is trusted for framing).
  - **Manual admin entries** for anything not captured automatically.

**Whitelist granularity (browser-enforceable only):**
- ✅ exact host: `https://grafana.lab:3000`
- ✅ subdomain wildcard: `https://*.lab.example.com`
- ✅ explicit IP host: `http://192.168.1.50:3000`
- ❌ **CIDR / IP ranges** (`192.168.1.0/24`) — **not expressible in CSP; not
  supported.** For a whole subnet, use a wildcard DNS domain. Calvin will not accept
  CIDR entries, to avoid a gap between what is configured and what is enforced.

### 3. Sealed mode

An opt-in lockdown flag (global, and/or per-kiosk to fit epic `calvin-dd9`'s
per-kiosk config model):
- Ignores the system allowlist and refuses to enable any plugin with a non-empty
  `browser_origins` → the effective CSP collapses to **self-only**.
- Honest trade: a sealed kiosk cannot show external web-service embeds or cast — it
  is calendars / photos / local-data plugins only. This is a deliberate lockdown, not
  the default.

### 4. Plugin contract change

- Add optional manifest field `browser_origins` (list of CSP host-sources; default
  `[]`). Documented in `PLUGIN_PACKAGE_FORMAT.md`.
- Loader validates entries are well-formed CSP host-sources (no CIDR).
- Backend-side network access requires **no** declaration — it is invisible to the
  kiosk.

## Enforcement layers (defense in depth)

1. **Runtime CSP** (browser blocks any undeclared origin) — the hard backstop.
2. **Consistent server-side image proxying** — images always served via
   `/api/images/{id}`; a plugin cannot leak an image even by accident.
3. **Manifest validation** at load — `browser_origins` must be explicit and
   well-formed; malformed → rejected.
4. **CI contract test** in `calvin-plugins` (extends `test_validate_plugins.py`) — a
   plugin's built bundle + sample payload must reference no origin outside its
   declaration.

## Phasing

**Phase 1 — Close today's leaks + baseline CSP (ships standalone; the real value).**
- `stores/images.js`: always route remote images through `/api/images/{id}`; never
  return a raw remote URL to the browser.
- Delete dead `WeatherWidget.vue`; remove the `index.html` OpenWeatherMap
  `dns-prefetch`.
- Serve the strict CSP with `frame-src` auto-derived from configured web-service
  instances so existing embeds keep working with zero admin action.
- Outcome: every non-web-service, non-cast plugin is sealed-clean; the kiosk talks
  only to Calvin + the operator's own configured service origins.

**Phase 2 — Whitelist model + plugin contract.**
- System-settings admin allowlist (domains, `*.` wildcards, explicit IP hosts; no
  CIDR), merged with auto-derived service origins into the CSP.
- `browser_origins` manifest field + loader validation. chromecast declares its Cast
  origins.

**Phase 3 — Sealed mode + guardrail.**
- Sealed-mode flag (global and/or per-kiosk via `calvin-dd9`).
- CI contract test in `calvin-plugins`.

## Non-goals (YAGNI)

- **Generic interactive reverse-proxy** for cross-origin services (WebSocket
  tunneling, auth/cookie rewriting, subpath rewriting, the same-origin-iframe
  privilege-inversion problem). Cross-origin services are handled by **whitelisting**,
  which also keeps iframes cross-origin-sandboxed. No shipping plugin needs a
  reverse-proxy; revisit only if a concrete need appears.
- **CIDR / IP-range enforcement** — not expressible in CSP.
- **"Kiosk survives server-down" offline snapshotting** — a resilience feature, not
  an attack-surface feature. Separate future brainstorm if wanted.

## Implementation risks / open questions

- **CSP vs. Vue/Vite inline styles.** Vue/Vite typically inject inline `<style>`;
  `style-src 'self' 'unsafe-inline'` is likely required (or nonces). Tune the policy
  against the **real built app** so the dashboard is not broken by the policy. Verify
  `script-src 'self'` is sufficient for the production build (no inline scripts).
- **Dynamic CSP generation** must reflect config changes (web-service add/remove,
  plugin enable/disable) without a rebuild — regenerate per `index.html` response.
- **HandoffOverlay degradation** on CSP-blocked frames must be graceful (ties into
  `calvin-ks7`).
- **Service-plugin payload images** (`ImageWithCaption` / any `image_url` renderer):
  no shipping plugin uses these today, but if one does, its `image_url` must route
  through a server image proxy or CSP will block it. Treat as a guard, not a Phase-1
  fix.

## Testing

- CSP header present and correct on the SPA response; `frame-src` reflects configured
  web-services and enabled-plugin `browser_origins`.
- Remote images resolve to `/api/images/{id}` and load under `img-src 'self'`.
- A web-service embed to a configured origin renders; an off-whitelist frame is
  blocked and degrades to the handoff error overlay.
- Sealed mode: system allowlist ignored, `browser_origins` plugins refused, effective
  CSP is self-only.
- `calvin-plugins` contract test fails a plugin that references an undeclared origin.
