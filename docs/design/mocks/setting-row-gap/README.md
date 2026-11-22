# Settings rows with two controls get a gap (calvin-4txw)

Review screenshots for the fix in
`frontend/src/components/settings/shell/SettingRow.vue`: a row whose control
holds two controls now leaves `--gap-inline` (8px) between them instead of
letting the buttons touch.

Every shot is mocked data only (Playwright's API mock; nothing reached a real
Calvin server or host). Viewports: 390x844 (phone) and 800x480 (kiosk). Themes:
light, and Backlit (`themeMode: "dark"`).

## The four rows

`before-*` is `origin/develop`; `after-*` is this branch.

| File suffix | Row | Where |
|---|---|---|
| `screen-now` | "Screen now" (Turn on now / Turn off now) | Screens › a screen › Power |
| `brightness-ramp` | "Ramp brightness at sleep and wake" (Check again + toggle) | Screens › a screen › Power › Brightness |
| `install-updates` | "Install updates" (Check status / Update now) | System › Updates |
| `server-display` | "Turn it off or on" (Turn off / Turn on) | System › Restart › The server's own screen |

## The side effects on single-control rows

- A lone toggle in a row is now centred on the row instead of sitting 4.5px
  above its centre (the inline-baseline line box used to hold it high). Row
  heights on a desktop or kiosk are unchanged.
- On the phone layout, 10 rows holding a toggle or a single line of text are
  8.5px shorter: the control's 32.5px inline line box becomes its 24px content
  height. The controls themselves do not move or resize.
- Stacked editors, the two-control rows above, and the page/region inspector
  keep their layout; nothing clips or wraps.
- `{before,after}-phone-{light,backlit}-page-backup-toggles.png` is that phone
  page (System › Backups) before and after, for judging the tighter rows.

Reproduce with:

```sh
cd frontend
E2E_PORT=5221 ROW_GAP_SHOTS=<this directory> ROW_GAP_STATE=after \
  npx playwright test --project=phone settings-row-gap
```
