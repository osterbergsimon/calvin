#!/usr/bin/env node
/**
 * Regenerate the README screenshot tour (CLV-68).
 *
 * Boots a throwaway Calvin on free ports with a temporary data directory:
 * `python -m app.demo seed` for the sample calendar, photos and pages, then a
 * backend and the Vite dev server. Chromium is driven through this app and the
 * captured PNGs are optimised to WebP; the setup flow is recorded and encoded
 * to a GIF. Nothing touches the owner's dev stack (8000/5173) or their data.
 *
 *   cd frontend && npm run capture:tour
 *
 * Needs `uv`, the Playwright Chromium (`npx playwright install chromium`) and
 * ffmpeg (a system `ffmpeg`, or Nix: the script falls back to `nix run
 * nixpkgs#ffmpeg --`).
 *
 * Environment:
 *   TOUR_OUT       output directory (default: ../docs/images/tour)
 *   TOUR_KEEP_DATA keep the temp data dir and raw PNG/WebM files
 *   FFMPEG         ffmpeg executable to use instead of auto-detection
 *
 * SAFETY: a backend started here runs as the owner on their desktop, and its
 * system routes act on THIS machine. The backend is started with
 * CALVIN_HOST_CONTROL=0, and every host-acting route is intercepted in the
 * browser as well, so no screenshot step can reboot, restart, update or
 * rotate anything.
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = dirname(HERE);
const REPO_ROOT = dirname(FRONTEND_DIR);
const BACKEND_DIR = join(REPO_ROOT, "backend");
const OUT_DIR = process.env.TOUR_OUT || join(REPO_ROOT, "docs", "images", "tour");
const KEEP_DATA = process.env.TOUR_KEEP_DATA === "1";
const TOUR_PASSWORD = "calvin-tour-password";

const HOST_ACTIONS = [
  /^\/api\/system\//,
  /^\/api\/display\//,
  /^\/api\/kiosks\/[^/]+\/update(?:\/|$)/,
];

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function log(message) {
  console.log(`[tour] ${message}`);
}

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForUrl(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await pause(300);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startProcess(name, command, args, options, logFile) {
  const out = logFile ? openSync(logFile, "a") : "ignore";
  const child = spawn(command, args, {
    ...options,
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.on("error", error => log(`${name} failed to start: ${error.message}`));
  if (typeof out === "number") closeSync(out);
  return child;
}

function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
}

function findFfmpeg() {
  if (process.env.FFMPEG) return { command: process.env.FFMPEG, args: [] };
  const system = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (system.status === 0) return { command: "ffmpeg", args: [] };
  const nix = spawnSync("nix", ["--version"], { stdio: "ignore" });
  if (nix.status === 0) return { command: "nix", args: ["run", "nixpkgs#ffmpeg", "--"] };
  throw new Error("ffmpeg not found. Install it or set FFMPEG=/path/to/ffmpeg.");
}

function runFfmpeg(ffmpeg, args) {
  const result = spawnSync(ffmpeg.command, [...ffmpeg.args, "-hide_banner", "-loglevel", "error", ...args], {
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`ffmpeg failed (${result.status})`);
}

/** Minimal iCal feed for the calendar the GIF adds, so its events are distinct. */
function buildTourIcs(today = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calvin//Tour sample//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Family calendar",
  ];
  const stamp = date =>
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
      date.getUTCDate()
    ).padStart(2, "0")}`;
  const at = (date, hour, minute = 0) => {
    const value = new Date(date);
    value.setUTCHours(hour, minute, 0, 0);
    return stamp(value) + "T" + String(hour).padStart(2, "0") + String(minute).padStart(2, "0") + "00Z";
  };
  const event = (uid, summary, start, end, location) => {
    lines.push("BEGIN:VEVENT", `UID:${uid}@calvin.test`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${summary}`);
    if (location) lines.push(`LOCATION:${location}`);
    lines.push("END:VEVENT");
  };

  const startDay = new Date(today);
  startDay.setUTCDate(startDay.getUTCDate() - 7);
  startDay.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset < 43; offset += 1) {
    const day = new Date(startDay);
    day.setUTCDate(day.getUTCDate() + offset);
    const weekday = day.getUTCDay(); // Sun=0
    const dayStamp = stamp(day);
    if (weekday === 3) {
      event(`book-club-${dayStamp}`, "Book club", at(day, 19), at(day, 20, 30), "Library");
    }
    if (weekday === 1 || weekday === 4) {
      event(`piano-${dayStamp}`, "Piano practice", at(day, 18), at(day, 18, 45));
    }
    if (weekday === 6) {
      event(`market-${dayStamp}`, "Farmers market", at(day, 10), at(day, 12), "Town square");
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

async function serveTourIcs() {
  const body = buildTourIcs();
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/book-club.ics")) {
      response.writeHead(200, { "content-type": "text/calendar; charset=utf-8" });
      response.end(body);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port };
}

/** Block every route that would act on the machine running Calvin. */
async function guardHostActions(page) {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (HOST_ACTIONS.some(pattern => pattern.test(url.pathname))) {
      log(`blocked host action ${url.pathname}`);
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          detail: { code: "host_action_blocked_by_tour_script", message: "Blocked by the screenshot script." },
        }),
      });
    }
    return route.continue();
  });
}

async function login(context, baseUrl) {
  const response = await context.request.post(`${baseUrl}/api/auth/login`, {
    data: { password: TOUR_PASSWORD },
  });
  if (!response.ok()) throw new Error(`Login failed: ${response.status()}`);
}

async function setDashboardDirection(baseUrl, direction) {
  const config = await fetch(`${baseUrl}/api/config`).then(response => response.json());
  const screens = structuredClone(config.dashboardScreens);
  for (const screen of screens.screens || []) {
    if (direction) screen.layout.direction = direction;
    else delete screen.layout.direction;
  }
  const response = await fetch(`${baseUrl}/api/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dashboardScreens: screens }),
  });
  if (!response.ok) throw new Error(`Could not set dashboard direction: ${response.status}`);
}

/** The GIF ends in day view (persisted per region); wide shots start in month. */
async function resetCalendarView(baseUrl) {
  const config = await fetch(`${baseUrl}/api/config`).then(response => response.json());
  const screens = structuredClone(config.dashboardScreens);
  for (const screen of screens.screens || []) {
    for (const region of screen.layout.regions || []) {
      if (region.kind === "calendar") {
        region.view = { ...(region.view || {}), mode: "month", rolling: false };
      }
    }
  }
  const response = await fetch(`${baseUrl}/api/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dashboardScreens: screens }),
  });
  if (!response.ok) throw new Error(`Could not reset the calendar view: ${response.status()}`);
}

async function captureScreenshot(page, path) {
  await page.screenshot({ path });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const workDir = mkdtempSync(join(tmpdir(), "calvin-tour-"));
  const dataDir = join(workDir, "data");
  const rawDir = join(workDir, "raw");
  const videoDir = join(workDir, "video");
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(videoDir, { recursive: true });

  const apiPort = await freePort();
  const webPort = await freePort();
  const baseUrl = `http://127.0.0.1:${webPort}`;
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const ics = await serveTourIcs();

  const children = [];
  let browser = null;

  const cleanup = () => {
    for (const child of children) stopProcess(child);
    ics.server.close();
    if (!KEEP_DATA) rmSync(workDir, { recursive: true, force: true });
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));

  try {
    log(`temp data ${dataDir}`);
    log("seeding sample calendar, photos and pages");
    const seed = spawnSync(
      "uv",
      [
        "run",
        "python",
        "-m",
        "app.demo",
        "seed",
        "--data-dir",
        dataDir,
        "--calendar-url",
        `${apiUrl}/api/demo/calendar.ics`,
      ],
      {
        cwd: BACKEND_DIR,
        env: { ...process.env, CALVIN_DATA_DIR: dataDir, API_PORT: String(apiPort) },
        stdio: "inherit",
      }
    );
    if (seed.status !== 0) throw new Error("Demo seed failed");

    log(`starting backend on ${apiUrl} (host control off)`);
    children.push(
      startProcess(
        "backend",
        "uv",
        ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(apiPort)],
        {
          cwd: BACKEND_DIR,
          env: {
            ...process.env,
            CALVIN_DATA_DIR: dataDir,
            API_PORT: String(apiPort),
            CALVIN_HOST_CONTROL: "0",
            // The Vite proxy is a different origin (a non-default port), so
            // the backend must accept this page's Origin for admin writes.
            CORS_ORIGINS: `http://127.0.0.1:${webPort}`,
            LOG_LEVEL: "WARNING",
          },
        },
        join(workDir, "backend.log")
      )
    );

    log(`starting vite on ${baseUrl}`);
    children.push(
      startProcess(
        "vite",
        "npm",
        ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
        {
          cwd: FRONTEND_DIR,
          env: { ...process.env, VITE_API_PROXY_TARGET: apiUrl },
        },
        join(workDir, "vite.log")
      )
    );

    await waitForUrl(`${apiUrl}/api/health`);
    await waitForUrl(baseUrl);
    log("stack is up");

    browser = await chromium.launch();
    const setupCode = readFileSync(join(dataDir, "setup-code.txt"), "utf8").trim();

    // ── First run on a phone ──────────────────────────────────────────────
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await guardHostActions(page);
      await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
      await page.locator('[data-test="auth-card"]').waitFor();
      await page.locator("#auth-setup-code").waitFor();
      const code = await page.locator("#auth-setup-code").inputValue();
      if (code !== setupCode) {
        throw new Error(`Setup code was not prefilled on the loopback screen (got ${code || "nothing"})`);
      }
      await pause(800);
      await captureScreenshot(page, join(rawDir, "phone-setup.png"));
      await context.close();
      log("captured first-run setup screen");
    }

    // ── Setup flow video: dashboard → password → add calendar → dashboard ──
    // The demo screens default to a row split. A phone is tall: stack them so
    // the closing dashboard shot is readable. This is the same per-screen
    // Layout setting a user can pick; it is a public display key.
    await setDashboardDirection(baseUrl, "column");

    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        isMobile: true,
        hasTouch: true,
        recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
      });
      const page = await context.newPage();
      await guardHostActions(page);
      const video = page.video();

      await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
      await pause(3_000);
      await page.getByRole("button", { name: "More controls" }).click();
      await pause(700);
      await page.locator('[data-admin="settings"]').click();
      await pause(1_800);

      await page.locator('[data-test="auth-card"]').waitFor();
      await page.locator("#auth-setup-code").waitFor();
      await page.locator("#auth-setup-password").click();
      await page.locator("#auth-setup-password").pressSequentially(TOUR_PASSWORD, { delay: 45 });
      await page.locator("#auth-setup-repeat").click();
      await page.locator("#auth-setup-repeat").pressSequentially(TOUR_PASSWORD, { delay: 45 });
      await pause(600);
      await page.getByRole("button", { name: "Set password" }).click();
      await pause(2_500);

      await page.locator(".category-rail__item", { hasText: "Content" }).first().click();
      await pause(1_200);
      await page.locator(".content-settings").scrollIntoViewIfNeeded();
      await pause(1_300);
      await page.getByRole("button", { name: "Add a calendar" }).click();
      await pause(900);
      await page.locator(".pp-panel").waitFor();
      await pause(700);
      await page.locator('.pp-panel [data-provider-id="ical"]').click();
      await page.locator(".instance-modal").waitFor();
      await pause(900);

      await page.locator('.instance-modal input.form-input[type="text"]').first().fill("Family calendar");
      await page
        .locator(".instance-modal .plugin-field input")
        .first()
        .pressSequentially(`http://127.0.0.1:${ics.port}/book-club.ics`, { delay: 12 });
      await pause(900);
      const save = page.locator(".instance-modal").getByRole("button", { name: "Save" });
      await save.click();
      await page.locator(".instance-modal").waitFor({ state: "hidden", timeout: 15_000 });
      await pause(2_000);

      await page.getByRole("button", { name: "Done" }).click();
      await pause(2_000);
      await page.waitForLoadState("networkidle");
      await pause(4_000);

      // End on today's day view, where the newly added calendar's event is
      // readable on a phone-width screen (month cells only show a few chips).
      await page.locator(".calendar-header__view-switch").first().click();
      await pause(700);
      await page.locator(".calendar-header__view-switch").first().click();
      await pause(3_000);

      await context.close();
      const videoPath = await video.path();
      log(`recorded setup flow: ${videoPath}`);
      const gifFrames = [
        { fps: 10, width: 390, colors: 128 },
        { fps: 8, width: 360, colors: 96 },
        { fps: 6, width: 320, colors: 64 },
      ];
      const ffmpeg = findFfmpeg();
      const gifPath = join(OUT_DIR, "setup-flow.gif");
      let encoded = false;
      for (const frame of gifFrames) {
        runFfmpeg(ffmpeg, [
          "-y",
          "-i",
          videoPath,
          "-vf",
          `fps=${frame.fps},scale=${frame.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=${frame.colors}:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
          "-loop",
          "0",
          gifPath,
        ]);
        const size = statSync(gifPath).size;
        log(`GIF ${frame.fps}fps/${frame.width}px: ${(size / 1024 / 1024).toFixed(2)} MB`);
        if (size < 4 * 1024 * 1024) {
          encoded = true;
          break;
        }
      }
      if (!encoded) throw new Error("GIF is still larger than 4 MB at the smallest preset");
    }

    // Back to the usual row split and month view for wide screens.
    await setDashboardDirection(baseUrl, null);
    await resetCalendarView(baseUrl);

    const ffmpeg = findFfmpeg();
    const toWebp = name => {
      const png = join(rawDir, `${name}.png`);
      const webp = join(OUT_DIR, `${name}.webp`);
      runFfmpeg(ffmpeg, [
        "-y",
        "-i",
        png,
        "-frames:v",
        "1",
        "-c:v",
        "libwebp",
        "-quality",
        "82",
        "-compression_level",
        "6",
        webp,
      ]);
      log(`${name}.webp ${(statSync(webp).size / 1024).toFixed(0)} KB`);
    };

    // ── Wide dashboards, light and dark ───────────────────────────────────
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        colorScheme: scheme,
      });
      await login(context, baseUrl);
      const page = await context.newPage();
      await guardHostActions(page);
      await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2_500);
      // Next month is where the seeded feed fills the grid with multi-day
      // events as well as the daily/weekly ones.
      await page.getByRole("button", { name: "Next" }).first().click();
      await page.waitForTimeout(3_000);
      await captureScreenshot(page, join(rawDir, `dashboard-${scheme}.png`));
      await context.close();
      log(`captured ${scheme} dashboard`);
    }
    toWebp("dashboard-light");
    toWebp("dashboard-dark");

    // ── Portrait wall screen ──────────────────────────────────────────────
    {
      const context = await browser.newContext({
        viewport: { width: 1080, height: 1920 },
        colorScheme: "light",
      });
      await login(context, baseUrl);
      const change = await context.request.post(`${baseUrl}/api/config`, {
        data: { applyDisplayRotation: false, orientation: "portrait" },
      });
      if (!change.ok()) throw new Error(`Could not set portrait orientation: ${change.status()}`);
      const page = await context.newPage();
      await guardHostActions(page);
      await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2_500);
      await page.getByRole("button", { name: "Next" }).first().click();
      await page.waitForTimeout(3_000);
      await captureScreenshot(page, join(rawDir, "dashboard-portrait.png"));
      await context.close();
      log("captured portrait dashboard");
    }
    toWebp("dashboard-portrait");

    // Restore the wide orientation for the settings captures.
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await login(context, baseUrl);
      const restore = await context.request.post(`${baseUrl}/api/config`, {
        data: { applyDisplayRotation: false, orientation: "landscape" },
      });
      if (!restore.ok()) throw new Error(`Could not restore landscape orientation: ${restore.status()}`);
      await context.close();
    }

    // ── Settings: Content and Screens ─────────────────────────────────────
    {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        colorScheme: "light",
      });
      await login(context, baseUrl);
      // Register a sample kiosk so the Screens page shows a connected display.
      const kiosk = await context.newPage();
      await guardHostActions(kiosk);
      await kiosk.goto(`${baseUrl}/?kiosk=Kitchen`, { waitUntil: "networkidle" });
      await kiosk.waitForTimeout(2_500);
      await kiosk.close();

      const page = await context.newPage();
      await guardHostActions(page);
      await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2_000);
      await page.locator(".category-rail__item", { hasText: "Content" }).first().click();
      await page.waitForTimeout(1_500);
      await captureScreenshot(page, join(rawDir, "settings-content.png"));
      await page.locator(".category-rail__item", { hasText: "Screens" }).first().click();
      await page.waitForTimeout(2_000);
      await captureScreenshot(page, join(rawDir, "settings-screens.png"));
      await context.close();
      log("captured settings pages");
    }
    toWebp("settings-content");
    toWebp("settings-screens");

    // ── Content settings on a phone ───────────────────────────────────────
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        isMobile: true,
        hasTouch: true,
      });
      await login(context, baseUrl);
      const page = await context.newPage();
      await guardHostActions(page);
      await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1_500);
      await page.locator(".category-rail__item", { hasText: "Content" }).first().click();
      await page.waitForTimeout(1_200);
      await page.locator(".content-settings").scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await captureScreenshot(page, join(rawDir, "phone-content.png"));
      await context.close();
      log("captured phone content settings");
    }
    toWebp("phone-setup");
    toWebp("phone-content");

    const outputFiles = readdirSync(OUT_DIR).filter(name => /\.(webp|gif)$/.test(name));
    const totalBytes = outputFiles.reduce((sum, name) => sum + statSync(join(OUT_DIR, name)).size, 0);
    log(`done → ${OUT_DIR}`);
    for (const name of outputFiles) {
      log(`  ${name} ${(statSync(join(OUT_DIR, name)).size / 1024).toFixed(0)} KB`);
    }
    log(`  total ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  } finally {
    await browser?.close().catch(() => {});
    for (const child of children) stopProcess(child);
    ics.server.close();
    if (KEEP_DATA) log(`kept ${workDir}`);
    else rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`[tour] ${error.stack || error.message}`);
  process.exit(1);
});
