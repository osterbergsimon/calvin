# Theme tokens — screenshots

Captures for CLV-64 (no hard-coded colours or type sizes in the frontend),
taken against a mocked backend (no owner data) at 1360×900.

| File | Theme | Mode | What it shows |
|---|---|---|---|
| `dashboard-light.png` | Light | light | Dashboard: month calendar, photo region, clock bar |
| `dashboard-dark.png` | Dark | dark | The same dashboard in Backlit |
| `dashboard-ocean.png` | Ocean | light | A contrasting light theme (blue focus accent) |
| `settings-light.png` | Light | light | Settings › Content › Calendars |
| `settings-dark.png` | Dark | dark | Settings › Content › Calendars in Backlit |
| `settings-sunset-dark.png` | Sunset | dark | A contrasting dark theme (warm accent) |

The point of the set: every surface, label and control is painted by the theme
tokens, so the two contrasting themes change the whole screen — not just the
accent — and the type scale is the same in each.

Contrast is enforced, not eyeballed: `frontend/tests/unit/styles/themeContrast.spec.js`
measures every text/background token pair the components use in all five
built-in themes × light/dark (4.5:1 body, 3:1 large text), and
`tokenLint.spec.js` fails the build on any colour literal or raw font size
under `frontend/src`.
