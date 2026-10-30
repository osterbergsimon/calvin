# Chips and tags — screenshots

Before/after captures for [the chips and tags spec](../../../2026-10-30-chips-and-tags.md),
taken against a mocked backend (no owner data) at 1360×900.

| File | What it shows |
|---|---|
| `content-*.png` | Settings › Content: calendars and sources |
| `plugins-*.png` | Settings › Plugins: installed cards, kind and install tags |
| `screens-*.png` | Settings › Screens: the screen cards |
| `editor-tabs-*.png` | Pages & regions editor: page tabs and the Page · Home heading |
| `editor-region-*.png` | Pages & regions editor: Region · in Home |
| `editor-tabs-dark-*.png` | The editor in the Backlit (dark) theme |

`*-before.png` is commit `931ace06`; `*-after.png` is this branch. Tag contrast
for every built-in theme is enforced by
`frontend/tests/unit/styles/tagContrast.spec.js`.
