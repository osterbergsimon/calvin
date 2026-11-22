# First photo priority (calvin-jwg9, audit 2 P1)

Before/after of the fullscreen photo frame on an 800x480 wall, Standard and Full effects.
`before-*` is `origin/develop`; `after-*` is this branch. Mocked data only: a generated portrait
SVG answered every photo request (Playwright route interception; nothing reached a real server).

The backdrop looks the same before and after. The two shots differ only in the clock bar time
(12:40 vs 12:50) and anti-aliasing. The mock serves one image for every width, so these shots
cannot show the smaller 640 px download; that is covered by the unit test on the backdrop `src`.
