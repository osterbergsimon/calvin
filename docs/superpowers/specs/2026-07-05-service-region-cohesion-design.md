# Service regions: design-cohesion + token adoption pass (calvin-0wr)

**Date:** 2026-07-05
**Bead:** calvin-0wr
**Status:** approved

## Goal

Bring the dashboard SERVICE region components fully in line with the redesigned
UI and the sizing/token vocabulary (`docs/design/2026-07-04-ui-sizing-tokens.md`),
the same way calvin-4d2 did the regions editor. After this pass a service region
is visually indistinguishable from the calendar region in control sizing, radius,
and color, and **no legacy tokens** (`--bg-primary`, `--bg-secondary`,
`--bg-tertiary`, `--text-primary`, `--text-secondary`, `--text-tertiary`,
`--border-color`, `--accent-*`) remain in service components.

This also completes the last IconButton migration deferred from calvin-b97
(the `dashboard-panel__icon-button` call sites in the service viewer).

## Token map

The redesign exposes a **single accent** (`--focus`, amber) — there is no
separate `--accent` semantic token. Legacy → semantic:

| Legacy | Semantic |
|---|---|
| `--bg-primary` | `--bg-1` |
| `--bg-secondary` | `--bg-2` |
| `--bg-tertiary` | `--bg-0` |
| `--text-primary` | `--ink` |
| `--text-secondary` | `--ink-2` |
| `--text-tertiary` | `--ink-3` |
| `--border-color` | `--line` |
| `--accent-primary` | `--focus` |
| `--accent-secondary` | `--focus` (hover via `filter: brightness()`) |
| `--accent-error` | `--err` |

Radius: hardcoded `4px`/`8px` → `var(--radius-sm)` (8px). `--control-height`
= 48px maps exactly to `IconButton size="lg"`; `1.75rem` controls map to
`IconButton size="sm"`.

## Changes by file

### 1. `frontend/src/components/WebServiceViewer.vue`

**Template** — migrate the four bespoke icon buttons (‹ previous, › next,
⤢ fullscreen, × close, all currently `class="dashboard-panel__icon-button"`)
to `<IconButton size="sm">`. The `.dashboard-panel__icon-button` CSS in
`main.css` is already pixel-identical to IconButton `default`/`sm`/`square`,
so this is a clean swap. Import `IconButton` from `@/components/ui/IconButton.vue`.
Each button carries `:label`/`title` (aria-label required by IconButton) and its
existing `@click` handler (fall-through on the single `<button>` root).

**Fullscreen close** — `.btn-close-fullscreen` becomes
`<IconButton size="lg" shape="circle" variant="default">`. Keep the floating
affordance (drop-shadow + `scale(1.1)` hover) on the overlay wrapper
(`.fullscreen-close-overlay` / a wrapper class), NOT on the button chrome.
Delete the bespoke `.btn-close-fullscreen` button rules (background/color/
border/border-radius/width/height/font-size/focus). The glyph shrinks
2rem → IconButton lg's 1.5rem, which is acceptable.

**Style block:**
- `.loading-state, .no-services` — `color: var(--text-tertiary)` → `var(--ink-3)`
- `.spinner` — `border: 4px solid var(--border-color)` → `var(--line)`;
  `border-top: 4px solid var(--accent-primary)` → `var(--focus)`
  (40px size stays — decorative)
- `.web-service-viewer` — `border-radius: 8px` → `var(--radius-sm)`

### 2. `frontend/src/components/service/IframeViewer.vue`

Live component (used by `plugins/overlays/EmbedOverlay.vue` for in-app link
handoff). Migrate the error-dialog styling:

- `.service-iframe` bg `--bg-primary` → `--bg-1`
- `.iframe-error-message` bg `--bg-primary` → `--bg-1`
- `.error-content h3` color `--accent-error` → `--err`
- `.error-content p` color `--text-secondary` → `--ink-2`
- `.service-url` color `--text-primary` → `--ink`; bg `--bg-secondary` → `--bg-2`;
  `border-radius: 4px` → `var(--radius-sm)`
- `.btn-open-new, .btn-retry` `border-radius: 4px` → `var(--radius-sm)`
- `.btn-open-new` bg `--accent-primary` → `--focus`; `color: white` → `var(--focus-ink)`;
  hover bg `--accent-secondary` → `filter: brightness(1.08)`
- `.btn-retry` bg `--bg-secondary` → `--bg-2`; color `--text-primary` → `--ink`;
  border `--border-color` → `--line`; hover bg `--bg-tertiary` → `--bg-0`
- `.error-content` `max-width: 500px` — structural, leave

### 3. `frontend/src/components/service/ServiceViewer.vue`

- `.unknown-service` `color: var(--text-secondary)` → `var(--ink-2)` (one line)

### 4. `frontend/src/components/dashboard/ServiceRegionViewOptions.vue`

Audit only. Already fully semantic-token'd (`--ink`, `--bg-1`, `--line`,
`--focus`, `--focus-ink`) and at parity with the calendar `RegionViewOptions`.
No change expected; confirm during verification.

## Verification

- `npm test` (unit) + eslint + `vite build` green.
- Side-by-side dashboard screenshot (calendar + service region both focused) via
  Playwright — confirm control sizing, radius, and color parity.
- Render the iframe error state — confirm the migrated dialog uses semantic
  tokens (amber primary button, `--err` heading, `--bg-1` backdrop).

## Done criteria

Service region visually indistinguishable in control sizing/radius/color from
the calendar region at default; no legacy `--bg-primary`/`--text-*`/
`--border-color`/`--accent-*` remain in the four service components; tests/lint/
build green.
