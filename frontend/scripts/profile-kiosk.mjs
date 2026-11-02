#!/usr/bin/env node
/**
 * Kiosk performance profiler (calvin-qpao, phase 1).
 *
 * Builds the production frontend, serves `dist/` with `vite preview`, drives it
 * with Playwright/Chromium at 1280x720 under CDP CPU throttling rate 6, and
 * records the interactions that feel slow on a Raspberry Pi 3B+ kiosk:
 *
 *   - initial load to first meaningful paint
 *   - switching dashboard page (clock-bar screen dots)
 *   - advancing the photo slideshow
 *   - opening/closing the kiosk menu (⋯) and the on-screen keyboard
 *   - 30 s idle on the dashboard
 *
 * Every /api request is answered by the existing mocked harness
 * (tests/e2e/phone/fixtures/api-mock.js), so nothing reaches a real backend and
 * host-acting routes stay intercepted.
 *
 * Output: a JSON report (default /tmp/opencode/kiosk-profile.json) and a
 * human-readable summary on stdout. This script does not optimise anything.
 *
 * Usage:
 *   node scripts/profile-kiosk.mjs                 # build + preview + profile
 *   node scripts/profile-kiosk.mjs --skip-build    # reuse dist/
 *   node scripts/profile-kiosk.mjs --base-url http://localhost:4173
 *   node scripts/profile-kiosk.mjs --out /tmp/opencode/kiosk-profile.json
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, deflateSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import { installApiMock } from "../tests/e2e/phone/fixtures/api-mock.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(HERE, "..");
const REPO_DIR = resolve(FRONTEND_DIR, "..");
const DIST_DIR = join(FRONTEND_DIR, "dist");
const DEFAULT_OUT = "/tmp/opencode/kiosk-profile.json";
const PREVIEW_PORT = Number(process.env.KIOSK_PROFILE_PORT || 4173);
const VIEWPORT = { width: 1280, height: 720 };
const CPU_THROTTLE = 6;
const IDLE_MS = 30_000;

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    skipBuild: false,
    baseUrl: null,
    out: DEFAULT_OUT,
    only: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--skip-build") args.skipBuild = true;
    else if (arg === "--base-url") args.baseUrl = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--only") args.only = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log("See the header of scripts/profile-kiosk.mjs for usage.");
      process.exit(0);
    }
  }
  return args;
}

// ── Preview server ──────────────────────────────────────────────────────────

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: FRONTEND_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let output = "";
    child.stdout.on("data", chunk => {
      output += chunk;
      if (options.echo) process.stdout.write(chunk);
    });
    child.stderr.on("data", chunk => {
      output += chunk;
      if (options.echo) process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) resolvePromise(output);
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output}`));
    });
  });
}

/**
 * A temporary Vite config for the profiling build. It reuses the real config
 * and adds one transform that exposes the Vue app and counts component
 * mounts/updates (production Vue does not publish `#app.__vue_app__`).
 */
function createProfileConfig() {
  const configPath = "/tmp/opencode/calvin-profile-vite.config.mjs";
  const source = `import baseConfig from ${JSON.stringify(join(FRONTEND_DIR, "vite.config.js"))};

const exposeApp = {
  name: "calvin-profile-expose-app",
  enforce: "pre",
  transform(code, id) {
    if (!id.endsWith("/src/main.js")) return null;
    const marker = 'app.mount("#app");';
    if (!code.includes(marker)) return null;
    const injected = [
      "window.__calvinProfile = window.__calvinProfile || {};",
      "window.__calvinProfile.app = app;",
      "window.__calvinProfile.counters = { updates: 0, mounts: 0, unmounts: 0, byComponent: {}, mountedByComponent: {} };",
      "const profileName = vm => (vm && (vm.$options.name || vm.$options.__name || (vm.$ && vm.$.type && vm.$.type.__name))) || 'anonymous';",
      "app.mixin({",
      "  beforeUpdate() {",
      "    const c = window.__calvinProfile.counters;",
      "    c.updates += 1;",
      "    const n = profileName(this);",
      "    c.byComponent[n] = (c.byComponent[n] || 0) + 1;",
      "  },",
      "  mounted() {",
      "    const c = window.__calvinProfile.counters;",
      "    c.mounts += 1;",
      "    const n = profileName(this);",
      "    c.mountedByComponent[n] = (c.mountedByComponent[n] || 0) + 1;",
      "  },",
      "  beforeUnmount() { window.__calvinProfile.counters.unmounts += 1; },",
      "});",
      marker,
    ].join("\\n");
    return { code: code.replace(marker, injected), map: null };
  },
};

export default {
  ...baseConfig,
  root: ${JSON.stringify(FRONTEND_DIR)},
  plugins: [exposeApp, ...(baseConfig.plugins || [])],
};
`;
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, source);
  return configPath;
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Preview server did not answer at ${url}`);
}

async function startPreview() {
  const child = spawn(
    "npm",
    ["run", "preview", "--", "--port", String(PREVIEW_PORT), "--strictPort"],
    {
      cwd: FRONTEND_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let output = "";
  child.stdout.on("data", chunk => {
    output += chunk;
  });
  child.stderr.on("data", chunk => {
    output += chunk;
  });
  child.on("exit", code => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`preview exited ${code}\n${output}`);
    }
  });
  const url = `http://localhost:${PREVIEW_PORT}`;
  try {
    await waitForServer(url);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
  return { child, url };
}

// ── Mock data ───────────────────────────────────────────────────────────────

const REAL_KINDS = ["calendar", "photos"];

const REGION_INSTANCES = {
  calendar: ["src-family"],
  photos: ["local-images"],
  service: ["svc-weather"],
};

/**
 * Two screens containing only `kinds`, in different orders. A page switch then
 * unmounts every region type and mounts it again, which is what a real switch
 * does when the next screen has a different layout.
 */
function makeScreens(kinds) {
  // The layout normaliser always materialises at least one region, so a
  // "clock bar only" screen is one empty service region plus the bar. Keep its
  // instance list empty so no content fetch or iframe happens.
  const order = kinds.length ? kinds : ["service"];
  const build = (prefix, kindsOrder) => {
    const regions = kindsOrder.map(kind => ({
      id: `${prefix}-${kind}`,
      kind,
      instanceIds: kinds.length ? REGION_INSTANCES[kind] || [] : [],
      size: Math.max(1, Math.round(100 / kindsOrder.length)),
    }));
    return {
      layout: { version: 1, preset: order.length === 1 ? "single" : "split_two", regions },
      activeRegionId: regions[0]?.id || null,
    };
  };
  const first = build("region", order);
  const second = build("region-b", [...order].reverse());
  return {
    version: 2,
    activeScreenId: "page-one",
    screens: [
      { id: "page-one", name: "One", ...first },
      { id: "page-two", name: "Two", ...second },
    ],
  };
}

function makeEvents(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const at = (day, hour, minute = 0) => new Date(year, month, day, hour, minute, 0, 0);
  const iso = date => date.toISOString();
  const event = (id, title, start, end, allDay = false) => ({
    id,
    title,
    start: iso(start),
    end: iso(end),
    all_day: allDay,
    source: "src-family",
  });

  const events = [
    event("ev-1", "School drop-off", at(2, 8, 0), at(2, 8, 45)),
    event("ev-2", "Standup", at(2, 9, 30), at(2, 9, 45)),
    event("ev-3", "Dentist", at(3, 10, 0), at(3, 11, 0)),
    event("ev-4", "Lunch with Mia", at(3, 12, 0), at(3, 13, 30)),
    event("ev-5", "Football practice", at(4, 17, 30), at(4, 19, 0)),
    event("ev-6", "Piano lesson", at(5, 15, 0), at(5, 16, 0)),
    event("ev-7", "Groceries", at(6, 10, 0), at(6, 11, 0)),
    event("ev-8", "Birthday party", at(7, 14, 0), at(7, 17, 0)),
    event("ev-9", "Book club", at(9, 19, 0), at(9, 20, 30)),
    event("ev-10", "Doctor", at(10, 8, 30), at(10, 9, 15)),
    event("ev-11", "Team dinner", at(11, 18, 0), at(11, 21, 0)),
    event("ev-12", "Swimming", at(12, 7, 0), at(12, 8, 0)),
    event("ev-13", "Parent evening", at(13, 18, 30), at(13, 20, 0)),
    event("ev-14", "Weekend trip", at(14, 9, 0), at(16, 18, 0), true),
    event("ev-15", "Car service", at(17, 9, 0), at(17, 12, 0)),
    event("ev-16", "Movie night", at(18, 20, 0), at(18, 22, 30)),
    event("ev-17", "Grandma visits", at(20, 11, 0), at(20, 16, 0)),
    event("ev-18", "Concert", at(21, 19, 30), at(21, 22, 0)),
    event("ev-19", "Haircut", at(23, 13, 0), at(23, 14, 0)),
    event("ev-20", "Holiday", at(24, 0, 0), at(26, 23, 59), true),
    event("ev-21", "Dinner at Anna's", at(27, 18, 0), at(27, 21, 0)),
    event("ev-22", "Yoga", at(28, 7, 30), at(28, 8, 30)),
  ];
  return events;
}

const PHOTO_META = [
  { id: "img-garden", filename: "garden.jpg", width: 4032, height: 3024 },
  { id: "img-harbour", filename: "harbour.jpg", width: 4032, height: 3024 },
  { id: "img-party", filename: "party.jpg", width: 3024, height: 4032 },
  { id: "img-forest", filename: "forest.jpg", width: 4032, height: 3024 },
  { id: "img-lake", filename: "lake.jpg", width: 4032, height: 3024 },
];

function makeImages() {
  return PHOTO_META.map((image, index) => ({
    ...image,
    source: "local-images",
    folder: index === 2 ? "Guests" : "",
    modified: new Date(Date.now() - index * 86_400_000).toISOString(),
  }));
}

/**
 * A real 4032x3024 PNG (12 MP, the shape of a phone photo) with a private
 * ancillary chunk padding it to roughly 4 MB. The browser decodes a real
 * 12 MP image but downloads a realistic photo-sized payload.
 */
function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePhotoPng(width = 4032, height = 3024, targetBytes = 4_000_000) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * rowLength;
    raw[row] = 0; // filter: none
    const sky = 120 + 80 * (1 - y / height);
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 3;
      const warm = 60 + 120 * (x / width);
      // Smooth low-frequency variation compresses like a photograph's sky,
      // leaving room for the private padding chunk below.
      raw[offset] = Math.min(255, Math.round(sky + 10 * Math.sin(x / 220)));
      raw[offset + 1] = Math.min(255, Math.round(warm + 8 * Math.cos(y / 190)));
      raw[offset + 2] = Math.min(255, Math.round(90 + 20 * Math.sin((x + y) / 640)));
    }
  }

  const idat = deflateSync(raw, { level: 1 });
  const parts = [signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat)];

  // Pad with a private ancillary chunk. Decoders skip it; the network still
  // carries a photo-sized payload.
  const current = Buffer.concat(parts).length + 12; // IEND chunk
  const padLength = Math.max(0, targetBytes - current);
  if (padLength > 0) {
    const pad = Buffer.alloc(padLength);
    for (let i = 0; i < padLength; i += 1) pad[i] = (i * 31 + 17) % 251;
    parts.push(pngChunk("prVt", pad));
  }
  parts.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function mockOptions({ photoRotationInterval = 30, auth, kinds = REAL_KINDS } = {}) {
  const images = makeImages();
  const screens = makeScreens(kinds);
  let imageIndex = 0;
  return {
    auth: auth || { configured: true, authenticated: true },
    config: {
      dashboardScreens: screens,
      availableScreens: screens.screens.map(screen => screen.id),
      defaultScreenId: "page-one",
      showUI: true,
      regionsLocked: true,
      clockBarMode: "horizontal",
      clockBarPosition: "top",
      clockBarShowInKiosk: false,
      clockShowDate: true,
      clockShowSeconds: false,
      calendarSplit: 62,
      maxVisibleEvents: 4,
      photoRotationInterval,
      photoFrameEnabled: false,
      focusLightMode: "interaction",
      focusLightDimOthers: true,
      modeIndicatorTimeout: 5,
      timeFormat: "24h",
      weekStartDay: 1,
      themeMode: "light",
      selectedTheme: null,
      calendarRefreshInterval: 15,
      configPollInterval: 30,
      imageDisplayMode: "smart",
      touchControls: "auto",
      touchControlSize: "medium",
    },
    overrides: [
      [
        /^\/api\/plugins\/web-embed$/,
        route =>
          json(route, {
            id: "web-embed",
            name: "Web page",
            type: "service",
            version: "1.0.0",
            enabled: true,
            instance_label: "web page",
            instance_config_schema: {
              url: { type: "string", label: "Address", required: true },
            },
            // The real backend resolves the instance URL into the schema.
            display_schema: { kind: "iframe", url: "https://example.com/weather" },
            statusbar_schema: null,
          }),
      ],
      [/^\/api\/calendar\/events$/, route => json(route, { events: makeEvents() })],
      [/^\/api\/images\/list$/, route => json(route, { images })],
      [
        /^\/api\/images\/current$/,
        route => json(route, { image: images[imageIndex % images.length] }),
      ],
      [
        /^\/api\/images\/next$/,
        route => {
          imageIndex = (imageIndex + 1) % images.length;
          return json(route, { image: images[imageIndex] });
        },
      ],
      [
        /^\/api\/images\/previous$/,
        route => {
          imageIndex = (imageIndex - 1 + images.length) % images.length;
          return json(route, { image: images[imageIndex] });
        },
      ],
    ],
  };
}

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

// ── Browser instrumentation ────────────────────────────────────────────────

function instrumentationScript() {
  return () => {
    const state = {
      intervals: new Map(),
      timeouts: new Map(),
      rafCalls: 0,
      rafCallbacks: 0,
      longTasks: [],
      lcp: 0,
      errors: [],
    };
    window.__kioskProfile = state;

    const __kioskCaptureStack = () => {
      const value = new Error().stack || "";
      return value
        .split("\n")
        .slice(2, 4)
        .map(line => line.trim())
        .join(" | ");
    };

    const originalSetInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);
    const originalSetTimeout = window.setTimeout.bind(window);
    const originalClearTimeout = window.clearTimeout.bind(window);
    const originalRaf = window.requestAnimationFrame.bind(window);
    const originalCancelRaf = window.cancelAnimationFrame.bind(window);

    window.setInterval = function (handler, delay, ...args) {
      const record = {
        delay: Number(delay) || 0,
        fires: 0,
        stack: __kioskCaptureStack(),
        kind: "interval",
      };
      const wrapped =
        typeof handler === "function"
          ? function (...callArgs) {
              record.fires += 1;
              return handler.apply(this, callArgs);
            }
          : handler;
      const id = originalSetInterval(wrapped, delay, ...args);
      state.intervals.set(id, record);
      return id;
    };
    window.clearInterval = function (id) {
      state.intervals.delete(id);
      return originalClearInterval(id);
    };

    window.setTimeout = function (handler, delay, ...args) {
      const record = {
        delay: Number(delay) || 0,
        // Only long-lived timers matter for the idle report; capturing a stack
        // for every 0 ms transition timer would distort the CPU profile.
        stack: Number(delay) >= 1000 ? __kioskCaptureStack() : "",
        dueAt: performance.now() + (Number(delay) || 0),
        kind: "timeout",
      };
      let id = null;
      const wrapped =
        typeof handler === "function"
          ? function (...callArgs) {
              state.timeouts.delete(id);
              return handler.apply(this, callArgs);
            }
          : handler;
      id = originalSetTimeout(wrapped, delay, ...args);
      state.timeouts.set(id, record);
      return id;
    };
    window.clearTimeout = function (id) {
      state.timeouts.delete(id);
      return originalClearTimeout(id);
    };

    window.requestAnimationFrame = function (handler) {
      state.rafCalls += 1;
      return originalRaf(function (timestamp) {
        state.rafCallbacks += 1;
        return handler(timestamp);
      });
    };
    window.cancelAnimationFrame = function (id) {
      return originalCancelRaf(id);
    };

    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration,
            name: entry.name,
          });
        }
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      // Long Task API unavailable; the run still records Performance metrics.
    }

    try {
      new PerformanceObserver(list => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) state.lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // LCP unavailable.
    }

    window.addEventListener("error", event => {
      state.errors.push(String(event.message || event.error || "error"));
    });
    window.addEventListener("unhandledrejection", event => {
      state.errors.push(String(event.reason || "unhandled rejection"));
    });
  };
}

async function resetInstrumentation(page) {
  await page.evaluate(() => {
    const state = window.__kioskProfile;
    if (!state) return;
    state.longTasks.length = 0;
    state.rafCalls = 0;
    state.rafCallbacks = 0;
    state.errors.length = 0;
    for (const record of state.intervals.values()) record.fires = 0;
  });
}

async function readTimers(page) {
  return page.evaluate(() => {
    const state = window.__kioskProfile;
    const now = performance.now();
    const intervals = [...state.intervals.entries()].map(([id, record]) => ({
      id,
      delay: record.delay,
      fires: record.fires,
      stack: record.stack,
    }));
    const timeouts = [...state.timeouts.entries()]
      .map(([id, record]) => ({
        id,
        delay: record.delay,
        remaining: Math.max(0, Math.round(record.dueAt - now)),
        stack: record.stack,
      }))
      .filter(record => record.remaining > 0);
    const animations = document
      .getAnimations()
      .filter(animation => animation.playState === "running" || animation.playState === "paused")
      .map(animation => {
        const target = animation.effect?.target;
        const computed = target ? getComputedStyle(target) : null;
        return {
          kind: animation.constructor?.name || "Animation",
          name: animation.animationName || animation.transitionProperty || "",
          playState: animation.playState,
          iterations: animation.effect?.getTiming?.().iterations ?? null,
          duration: animation.effect?.getTiming?.().duration ?? null,
          target: target
            ? `${target.tagName.toLowerCase()}${target.className ? `.${String(target.className).split(" ").join(".")}` : ""}`
            : null,
          animationPlayState: computed?.animationPlayState || null,
          transitionProperty: computed?.transitionProperty || null,
        };
      });
    return {
      intervals,
      timeouts,
      rafCalls: state.rafCalls,
      rafCallbacks: state.rafCallbacks,
      animations,
      longTasks: [...state.longTasks],
      errors: [...state.errors],
    };
  });
}

async function installRenderCounter(page) {
  return page.evaluate(() => {
    const profile = window.__calvinProfile;
    if (profile?.counters) {
      window.__kioskRenderBase = {
        updates: profile.counters.updates,
        mounts: profile.counters.mounts,
        unmounts: profile.counters.unmounts,
        byComponent: { ...profile.counters.byComponent },
        mountedByComponent: { ...profile.counters.mountedByComponent },
      };
      return { ok: true, mode: "mixin", wrapped: 0, total: 0 };
    }
    const app = document.querySelector("#app")?.__vue_app__;
    if (!app || !app._instance) return { ok: false, wrapped: 0, total: 0 };
    const state = (window.__kioskRender = {
      updates: 0,
      wrapped: 0,
      uids: [],
    });
    const seen = new Set();
    const wrap = instance => {
      if (!instance || seen.has(instance.uid)) return;
      seen.add(instance.uid);
      if (typeof instance.update === "function" && !instance.__kioskUpdate) {
        const original = instance.update;
        instance.update = function (...args) {
          state.updates += 1;
          return original.apply(this, args);
        };
        instance.__kioskUpdate = true;
        state.wrapped += 1;
      }
    };
    const visit = vnode => {
      if (!vnode || typeof vnode !== "object") return;
      if (vnode.component) {
        wrap(vnode.component);
        visit(vnode.component.subTree);
      }
      if (Array.isArray(vnode.children)) vnode.children.forEach(visit);
      if (Array.isArray(vnode.dynamicChildren)) vnode.dynamicChildren.forEach(visit);
    };
    visit(app._instance.subTree);
    state.uids = [...seen];
    return { ok: true, wrapped: state.wrapped, total: seen.size };
  });
}

async function readRenderCounter(page) {
  return page.evaluate(() => {
    const profile = window.__calvinProfile;
    const base = window.__kioskRenderBase;
    if (profile?.counters && base) {
      const delta = (now, before) => {
        const out = {};
        for (const [key, value] of Object.entries(now || {})) {
          const change = value - (before[key] || 0);
          if (change) out[key] = change;
        }
        return out;
      };
      return {
        mode: "mixin",
        updates: profile.counters.updates - base.updates,
        mounted: profile.counters.mounts - base.mounts,
        unmounted: profile.counters.unmounts - base.unmounts,
        byComponent: delta(profile.counters.byComponent, base.byComponent),
        mountedByComponent: delta(profile.counters.mountedByComponent, base.mountedByComponent),
      };
    }
    const app = document.querySelector("#app")?.__vue_app__;
    const state = window.__kioskRender;
    if (!app || !app._instance || !state) return null;
    const seen = new Set();
    const visit = vnode => {
      if (!vnode || typeof vnode !== "object") return;
      if (vnode.component) {
        seen.add(vnode.component.uid);
        visit(vnode.component.subTree);
      }
      if (Array.isArray(vnode.children)) vnode.children.forEach(visit);
      if (Array.isArray(vnode.dynamicChildren)) vnode.dynamicChildren.forEach(visit);
    };
    visit(app._instance.subTree);
    const before = new Set(state.uids);
    return {
      updates: state.updates,
      mounted: [...seen].filter(uid => !before.has(uid)).length,
      total: seen.size,
    };
  });
}

async function readAllRenderCounters(page) {
  return page.evaluate(() => {
    const counters = window.__calvinProfile?.counters;
    if (counters) {
      return {
        mode: "mixin",
        updates: counters.updates,
        mounted: counters.mounts,
        unmounted: counters.unmounts,
        byComponent: counters.byComponent,
        mountedByComponent: counters.mountedByComponent,
      };
    }
    return null;
  });
}

async function countMountedComponents(page) {
  return page.evaluate(() => {
    const app = document.querySelector("#app")?.__vue_app__;
    if (!app || !app._instance) return 0;
    const seen = new Set();
    const visit = vnode => {
      if (!vnode || typeof vnode !== "object") return;
      if (vnode.component) {
        seen.add(vnode.component.uid);
        visit(vnode.component.subTree);
      }
      if (Array.isArray(vnode.children)) vnode.children.forEach(visit);
      if (Array.isArray(vnode.dynamicChildren)) vnode.dynamicChildren.forEach(visit);
    };
    visit(app._instance.subTree);
    return seen.size;
  });
}

// ── Performance metrics ────────────────────────────────────────────────────

async function enablePerformance(cdp) {
  await cdp.send("Performance.enable");
}

async function getMetrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map(metric => [metric.name, metric.value]));
}

function metricDiff(before, after) {
  const keys = [
    "TaskDuration",
    "ScriptDuration",
    "LayoutDuration",
    "RecalcStyleDuration",
    "LayoutCount",
    "RecalcStyleCount",
    "JSHeapUsedSize",
    "Nodes",
    "Documents",
  ];
  const result = {};
  for (const key of keys) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    result[key] = Number.isFinite(delta) ? delta : 0;
  }
  return result;
}

// ── CPU profile symbolisation ──────────────────────────────────────────────

function makeSymbolizer() {
  const cache = new Map();
  const mapFor = url => {
    try {
      const pathname = new URL(url).pathname;
      if (!pathname.startsWith("/assets/js/")) return null;
      const file = join(DIST_DIR, pathname.replace(/^\//, ""));
      const mapPath = `${file}.map`;
      if (!existsSync(mapPath)) return null;
      if (!cache.has(mapPath)) {
        const map = JSON.parse(readFileSync(mapPath, "utf-8"));
        cache.set(mapPath, { map, tracer: new TraceMap(map), dir: dirname(mapPath) });
      }
      return cache.get(mapPath);
    } catch {
      return null;
    }
  };

  const cleanSource = source => {
    if (!source) return null;
    const absolute = source.startsWith("file:") ? fileURLToPath(source) : resolve(REPO_DIR, source);
    const rel = relative(REPO_DIR, absolute);
    return rel.startsWith("..") ? source : rel;
  };

  const symbolize = callFrame => {
    const { url, lineNumber, columnNumber, functionName } = callFrame;
    if (!url) {
      return { function: functionName || "(native)", file: null, line: null, column: null };
    }
    const map = mapFor(url);
    if (map) {
      const original = originalPositionFor(map.tracer, {
        line: lineNumber + 1,
        column: columnNumber || 0,
      });
      if (original && original.source) {
        return {
          function: original.name || functionName || "(anonymous)",
          file: cleanSource(original.source),
          line: original.line,
          column: original.column,
        };
      }
    }
    return {
      function: functionName || "(anonymous)",
      file: url.replace(/^https?:\/\/[^/]+/, ""),
      line: lineNumber + 1,
      column: columnNumber || 0,
    };
  };

  symbolize.stack = rawStack => {
    const matches = [...String(rawStack || "").matchAll(/(https?:\/\/[^)\s]+):(\d+):(\d+)/g)];
    const last = matches[matches.length - 1];
    if (!last) return rawStack || "";
    const [, url, line, column] = last;
    const location = symbolize({
      url,
      lineNumber: Number(line) - 1,
      columnNumber: Number(column),
      functionName: "",
    });
    return location.file ? `${location.file}:${location.line}` : `${url}:${line}`;
  };

  return symbolize;
}

const HARNESS_FUNCTIONS = new Set([
  "query",
  "evaluate",
  "InjectedScript",
  "elementsFromPoint",
  "elementFromPoint",
  "checkElementStates",
  "parseEvaluationResultValue",
  "markTargetElements",
  "isElementVisible",
  "querySelector",
  "querySelectorAll",
  "getAttribute",
  "setTimeout",
  "window.setTimeout",
  "requestAnimationFrame",
  "window.requestAnimationFrame",
  "__kioskCaptureStack",
  "_setupHitTargetInterceptors",
  "setupHitTargetInterceptor",
  "previewNode",
]);

function classifyFrame(location) {
  const name = location.function || "";
  if (HARNESS_FUNCTIONS.has(name)) return "harness";
  if (name === "(native)") return "native";
  const file = location.file || "";
  if (file.includes("node_modules")) return "vendor";
  if (file.includes("/src/") || file.startsWith("frontend/src") || file.includes("/assets/js/")) {
    return "app";
  }
  return "other";
}

function summarizeProfile(profile, symbolize) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children || []) parent.set(child, node.id);
  }
  const selfByNode = new Map();
  for (let i = 0; i < profile.samples.length; i += 1) {
    const id = profile.samples[i];
    const delta = profile.timeDeltas[i] || 0;
    selfByNode.set(id, (selfByNode.get(id) || 0) + delta);
  }

  const nearestSource = id => {
    let current = parent.get(id);
    while (current) {
      const node = nodes.get(current);
      if (node?.callFrame?.url) return symbolize(node.callFrame);
      current = parent.get(current);
    }
    return null;
  };

  const byLocation = new Map();
  let total = 0;
  let idleMicros = 0;
  let programMicros = 0;
  let gcMicros = 0;
  const categoryMicros = { app: 0, vendor: 0, harness: 0, native: 0, other: 0 };
  for (const [id, micros] of selfByNode) {
    total += micros;
    const node = nodes.get(id);
    if (!node) continue;
    const name = node.callFrame.functionName || "";
    if (name === "(idle)") {
      idleMicros += micros;
      continue;
    }
    if (name === "(program)") {
      programMicros += micros;
      continue;
    }
    if (name === "(garbage collector)") {
      gcMicros += micros;
      continue;
    }
    const location = symbolize(node.callFrame);
    if (!location.file) {
      const caller = nearestSource(id);
      if (caller?.file) {
        location.file = caller.file;
        location.line = caller.line;
        location.calledFrom = caller.function;
      }
    }
    const key = `${location.function}|${location.file || ""}|${location.line || ""}`;
    const existing = byLocation.get(key) || {
      ...location,
      category: classifyFrame(location),
      selfMicros: 0,
      samples: 0,
    };
    existing.selfMicros += micros;
    existing.samples += 1;
    byLocation.set(key, existing);
    categoryMicros[existing.category] += micros;
  }

  const busyMicros = Math.max(0, total - idleMicros);
  const toRow = item => ({
    function: item.function,
    file: item.file,
    line: item.line,
    calledFrom: item.calledFrom || null,
    category: item.category,
    selfMs: Number((item.selfMicros / 1000).toFixed(1)),
    percent: busyMicros > 0 ? Number(((item.selfMicros / busyMicros) * 100).toFixed(1)) : 0,
  });
  const sorted = [...byLocation.values()].sort((a, b) => b.selfMicros - a.selfMicros);
  const top = sorted.slice(0, 12).map(toRow);
  const topApp = sorted
    .filter(item => item.category === "app")
    .slice(0, 10)
    .map(toRow);
  const topVendor = sorted
    .filter(item => item.category === "vendor")
    .slice(0, 5)
    .map(toRow);

  return {
    sampledMs: Number((total / 1000).toFixed(1)),
    busyMs: Number((busyMicros / 1000).toFixed(1)),
    idleMs: Number((idleMicros / 1000).toFixed(1)),
    programMs: Number((programMicros / 1000).toFixed(1)),
    gcMs: Number((gcMicros / 1000).toFixed(1)),
    categoryMs: Object.fromEntries(
      Object.entries(categoryMicros).map(([key, micros]) => [
        key,
        Number((micros / 1000).toFixed(1)),
      ])
    ),
    top,
    topApp,
    topVendor,
  };
}

// ── Bundle analysis ────────────────────────────────────────────────────────

function listBundle() {
  const indexPath = join(DIST_DIR, "index.html");
  const html = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "";
  const entryScripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(
    match => match[1]
  );
  const jsDir = join(DIST_DIR, "assets/js");
  if (!existsSync(jsDir)) return { entryScripts, preloads, files: [] };
  const files = readdirSync(jsDir)
    .filter(name => name.endsWith(".js"))
    .map(name => {
      const buffer = readFileSync(join(jsDir, name));
      return {
        name,
        rawBytes: buffer.length,
        gzipBytes: gzipSync(buffer).length,
        initial:
          entryScripts.some(entry => entry.endsWith(name)) ||
          preloads.some(preload => preload.endsWith(name)),
      };
    })
    .sort((a, b) => b.rawBytes - a.rawBytes);
  return { entryScripts, preloads, files };
}

// ── Scenarios ──────────────────────────────────────────────────────────────

async function waitForDashboardReady(page, kinds = REAL_KINDS) {
  const wanted = new Set(kinds);
  await page.waitForFunction(
    expected => {
      const clockBar = document.querySelector(".clock-bar-horizontal");
      if (!clockBar) return false;
      if (expected.includes("calendar")) {
        const calendar = document.querySelector(".calendar-view .calendar-grid");
        const eventChips = document.querySelectorAll(
          ".calendar-grid .timed-event, .calendar-grid .ribbon, .calendar-grid .event-item"
        );
        if (!calendar || eventChips.length === 0) return false;
      }
      if (expected.includes("photos")) {
        const photo = document.querySelector(".photo-slideshow img.photo-image");
        if (!photo || !photo.complete || !photo.naturalWidth) return false;
      }
      if (expected.includes("service")) {
        const iframe = document.querySelector(".iframe-renderer iframe");
        if (!iframe) return false;
      }
      return true;
    },
    [...wanted],
    { timeout: 120_000, polling: 100 }
  );
  await page.evaluate(() => performance.mark("kiosk-fmp"));
}

async function loadDashboard(page, baseUrl, kinds = REAL_KINDS) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await waitForDashboardReady(page, kinds);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
}

async function collectPaint(page) {
  return page.evaluate(() => {
    const paints = Object.fromEntries(
      performance.getEntriesByType("paint").map(entry => [entry.name, entry.startTime])
    );
    const mark = performance.getEntriesByName("kiosk-fmp").pop();
    const state = window.__kioskProfile;
    return {
      firstPaint: paints["first-paint"] ?? null,
      firstContentfulPaint: paints["first-contentful-paint"] ?? null,
      firstMeaningfulPaint: mark ? mark.startTime : null,
      largestContentfulPaint: state?.lcp || null,
    };
  });
}

function startProfile(cdp) {
  return cdp.send("Profiler.start");
}

async function stopProfile(cdp) {
  const { profile } = await cdp.send("Profiler.stop");
  return profile;
}

async function runScenario(browser, baseUrl, name, options) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    hasTouch: Boolean(options.hasTouch),
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
  await enablePerformance(cdp);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await page.addInitScript(instrumentationScript());

  const assetRequests = [];
  const assetTasks = [];
  page.on("response", response => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/assets/")) return;
    const headers = response.headers();
    const type = headers["content-type"] || "";
    const length = Number(headers["content-length"] || 0);
    const record = {
      path: url.pathname,
      type,
      status: response.status(),
      bytes: Number.isFinite(length) ? length : 0,
    };
    assetRequests.push(record);
    if (!record.bytes && (url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))) {
      assetTasks.push(
        response
          .body()
          .then(body => {
            record.bytes = body.length;
          })
          .catch(() => {})
      );
    }
  });

  // The service-region fixture embeds an external page; mock that origin too so
  // no request leaves the browser.
  await page.route("https://example.com/**", route =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: '<!doctype html><html><body style="font: 16px sans-serif; padding: 24px">Mock weather service</body></html>',
    })
  );

  const mockState = await installApiMock(page, options.mock);
  const kinds = options.kinds || REAL_KINDS;
  const idleMs = options.idleMs || IDLE_MS;

  const scenario = {
    name: options.label || name,
    kinds,
    viewport: VIEWPORT,
    cpuThrottle: CPU_THROTTLE,
    metrics: null,
    paint: null,
    profile: null,
    renders: null,
    timers: null,
    assets: null,
    notes: options.notes || [],
  };

  try {
    if (name === "initial-load") {
      await startProfile(cdp);
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
      await waitForDashboardReady(page, kinds);
      await page.waitForTimeout(100);
      scenario.paint = await collectPaint(page);
      scenario.timers = await readTimers(page);
      scenario.profile = await stopProfile(cdp);
      scenario.metrics = metricDiff({}, await getMetrics(cdp));
      scenario.renders = (await readAllRenderCounters(page)) || {
        mounted: await countMountedComponents(page),
      };
    } else if (name === "page-switch") {
      await loadDashboard(page, baseUrl, kinds);
      await resetInstrumentation(page);
      const renderState = await installRenderCounter(page);
      scenario.notes.push(`render counter: ${JSON.stringify(renderState)}`);
      const before = await getMetrics(cdp);
      await resetInstrumentation(page);
      await startProfile(cdp);
      await page.locator(".screen-dot").nth(1).click();
      await page.waitForFunction(
        () => document.querySelectorAll(".screen-dot")[1]?.classList.contains("is-active"),
        { timeout: 30_000, polling: 100 }
      );
      await page.waitForTimeout(1200);
      scenario.profile = await stopProfile(cdp);
      scenario.metrics = metricDiff(before, await getMetrics(cdp));
      scenario.renders = await readRenderCounter(page);
      scenario.timers = await readTimers(page);
    } else if (name === "tap") {
      await loadDashboard(page, baseUrl, kinds);
      await resetInstrumentation(page);
      await installRenderCounter(page);
      const before = await getMetrics(cdp);
      await resetInstrumentation(page);
      await startProfile(cdp);
      if (kinds.length === 0 || (kinds.length === 1 && kinds[0] === "service")) {
        // A tap on the clock bar still lights the active region; an iframe
        // swallows clicks aimed at the region itself. Click the clock text,
        // not the left-hand logo/dots, so no screen change is triggered.
        await page.locator(".clock-bar-horizontal").click();
      } else {
        await page
          .locator(".dashboard-region")
          .first()
          .click({ position: { x: 4, y: 4 } });
      }
      await page.waitForTimeout(900);
      scenario.profile = await stopProfile(cdp);
      scenario.metrics = metricDiff(before, await getMetrics(cdp));
      scenario.renders = await readRenderCounter(page);
      scenario.timers = await readTimers(page);
    } else if (name === "photo-advance") {
      await loadDashboard(page, baseUrl, kinds);
      // Focus the photo region so its next/previous controls mount (the
      // dashboard's controls follow the active region).
      await page
        .locator(".photo-slideshow")
        .first()
        .click({ position: { x: 60, y: 60 } });
      await page.waitForTimeout(500);
      const beforeSrc = await page.locator(".photo-image").first().getAttribute("src");
      await resetInstrumentation(page);
      await installRenderCounter(page);
      const before = await getMetrics(cdp);
      await resetInstrumentation(page);
      await startProfile(cdp);
      // The panel's header controls sit in the same stacking layer as the
      // photo, so Playwright's hit test lands on the image. Drive the button's
      // click handler directly; the handler cost is what we are measuring.
      await page
        .locator('.photo-slideshow [data-action="next"]')
        .first()
        .evaluate(element => element.click());
      await page.waitForFunction(
        previous => document.querySelector(".photo-image")?.getAttribute("src") !== previous,
        beforeSrc,
        { timeout: 30_000, polling: 100 }
      );
      await page.waitForFunction(
        () => {
          const image = document.querySelector(".photo-image");
          return image && image.complete && image.naturalWidth > 0;
        },
        { timeout: 30_000, polling: 100 }
      );
      await page.waitForTimeout(400);
      scenario.profile = await stopProfile(cdp);
      scenario.metrics = metricDiff(before, await getMetrics(cdp));
      scenario.renders = await readRenderCounter(page);
      scenario.timers = await readTimers(page);
      scenario.photo = await page.evaluate(() => {
        const image = document.querySelector(".photo-image");
        const rect = image?.getBoundingClientRect();
        return {
          src: image?.getAttribute("src") || null,
          naturalWidth: image?.naturalWidth || 0,
          naturalHeight: image?.naturalHeight || 0,
          displayedWidth: rect ? Math.round(rect.width) : 0,
          displayedHeight: rect ? Math.round(rect.height) : 0,
        };
      });
    } else if (name === "menu") {
      await loadDashboard(page, baseUrl, kinds);
      await resetInstrumentation(page);
      await installRenderCounter(page);
      const before = await getMetrics(cdp);
      await resetInstrumentation(page);
      await startProfile(cdp);
      await page.locator(".admin-overflow__trigger").click();
      await page.locator(".popover__panel .menu").waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      await page.locator(".popover__panel").waitFor({ state: "detached", timeout: 10_000 });
      await page.waitForTimeout(400);
      scenario.profile = await stopProfile(cdp);
      scenario.metrics = metricDiff(before, await getMetrics(cdp));
      scenario.renders = await readRenderCounter(page);
      scenario.timers = await readTimers(page);
    } else if (name === "osk") {
      await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
      // A normal Settings text field (the search box) opens the same global
      // on-screen keyboard. The lock screen is not used here: with the mocked
      // unauthenticated state the production renderer crashes in this harness.
      const field = page.locator(".settings-search__input");
      await field.waitFor({ state: "visible", timeout: 60_000 });
      await page.waitForTimeout(800);
      await resetInstrumentation(page);
      await installRenderCounter(page);
      const before = await getMetrics(cdp);
      await resetInstrumentation(page);
      await startProfile(cdp);
      await field.tap();
      await page.locator(".osk.osk--shown").waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForTimeout(500);
      await page.locator('.osk.osk--shown .hg-button[data-skbtn="{hide}"]').tap();
      await page.locator(".osk.osk--shown").waitFor({ state: "detached", timeout: 10_000 });
      await page.waitForTimeout(400);
      scenario.profile = await stopProfile(cdp);
      scenario.metrics = metricDiff(before, await getMetrics(cdp));
      scenario.renders = await readRenderCounter(page);
      scenario.timers = await readTimers(page);
    } else if (name === "idle") {
      await loadDashboard(page, baseUrl, kinds);
      await page.waitForTimeout(1000);
      await resetInstrumentation(page);
      await installRenderCounter(page);
      const before = await getMetrics(cdp);
      await resetInstrumentation(page);
      await page.waitForTimeout(idleMs);
      scenario.metrics = metricDiff(before, await getMetrics(cdp));
      scenario.timers = await readTimers(page);
      scenario.renders = await readRenderCounter(page);
    } else {
      throw new Error(`Unknown scenario: ${name}`);
    }

    await Promise.allSettled(assetTasks);
    scenario.assets = {
      requests: assetRequests,
      jsBytes: assetRequests
        .filter(request => request.path.endsWith(".js"))
        .reduce((sum, request) => sum + request.bytes, 0),
      cssBytes: assetRequests
        .filter(request => request.path.endsWith(".css"))
        .reduce((sum, request) => sum + request.bytes, 0),
    };
    scenario.mock = {
      unmatched: mockState.unmatched,
      hostActions: mockState.hostActions,
    };
  } finally {
    await context.close();
  }

  return scenario;
}

// ── Reporting ──────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} kB`;
  return `${bytes} B`;
}

function printSummary(report) {
  console.log("\n=== Kiosk profile ===");
  console.log(
    `viewport ${VIEWPORT.width}x${VIEWPORT.height}, Chromium CPU throttle ${CPU_THROTTLE}x, mocked API`
  );
  console.log(`build: ${report.build.built ? "fresh" : "reused"} dist/`);

  console.log("\nInitial JS chunks (raw / gzip):");
  for (const file of report.bundle.files.filter(item => item.initial)) {
    console.log(
      `  ${file.name.padEnd(42)} ${formatBytes(file.rawBytes)} / ${formatBytes(file.gzipBytes)}`
    );
  }
  console.log("\nRoute and async chunks:");
  for (const file of report.bundle.files.filter(item => !item.initial).slice(0, 12)) {
    console.log(
      `  ${file.name.padEnd(42)} ${formatBytes(file.rawBytes)} / ${formatBytes(file.gzipBytes)}`
    );
  }

  for (const scenario of report.scenarios) {
    console.log(`\n--- ${scenario.name} ---`);
    if (scenario.paint) {
      const paint = scenario.paint;
      console.log(
        `paint: FP ${Math.round(paint.firstPaint || 0)} ms, FCP ${Math.round(
          paint.firstContentfulPaint || 0
        )} ms, FMP ${Math.round(paint.firstMeaningfulPaint || 0)} ms, LCP ${Math.round(
          paint.largestContentfulPaint || 0
        )} ms`
      );
    }
    if (scenario.metrics) {
      const metrics = scenario.metrics;
      console.log(
        `main thread ${Math.round(metrics.TaskDuration * 1000)} ms · script ${Math.round(
          metrics.ScriptDuration * 1000
        )} ms · style ${metrics.RecalcStyleCount}x/${Math.round(
          metrics.RecalcStyleDuration * 1000
        )} ms · layout ${metrics.LayoutCount}x/${Math.round(metrics.LayoutDuration * 1000)} ms`
      );
    }
    if (scenario.timers) {
      const longTasks = scenario.timers.longTasks || [];
      const longMs = longTasks.reduce((sum, task) => sum + task.duration, 0);
      console.log(
        `long tasks: ${longTasks.length} (${Math.round(longMs)} ms) · RAF callbacks: ${
          scenario.timers.rafCallbacks
        } · running animations: ${scenario.timers.animations.length}`
      );
    }
    if (scenario.renders) {
      console.log(
        `Vue: ${scenario.renders.updates ?? 0} updates, ${scenario.renders.mounted ?? 0} newly mounted`
      );
      const byComponent = Object.entries(scenario.renders.byComponent || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      if (byComponent.length) {
        console.log(
          `  updated: ${byComponent.map(([name, count]) => `${name}×${count}`).join(", ")}`
        );
      }
    }
    if (scenario.profile) {
      console.log(
        `CPU profile: busy ${scenario.profile.busyMs} ms (program ${scenario.profile.programMs} ms, GC ${scenario.profile.gcMs} ms, idle ${scenario.profile.idleMs} ms)`
      );
      console.log(
        `  categories: app ${scenario.profile.categoryMs.app} ms, vendor ${scenario.profile.categoryMs.vendor} ms, harness ${scenario.profile.categoryMs.harness} ms, native ${scenario.profile.categoryMs.native} ms`
      );
      console.log("top app self time (share of busy):");
      const rows = scenario.profile.topApp.length ? scenario.profile.topApp : scenario.profile.top;
      for (const item of rows.slice(0, 10)) {
        console.log(
          `  ${String(item.selfMs).padStart(7)} ms ${String(item.percent).padStart(5)}%  ${
            item.function
          }  ${item.file || ""}${item.line ? `:${item.line}` : ""}`
        );
      }
      if (scenario.profile.topVendor.length) {
        console.log("top vendor self time:");
        for (const item of scenario.profile.topVendor.slice(0, 3)) {
          console.log(
            `  ${String(item.selfMs).padStart(7)} ms  ${item.function}  ${item.file || ""}${
              item.line ? `:${item.line}` : ""
            }`
          );
        }
      }
    }
    if (scenario.photo) {
      console.log(
        `photo: ${scenario.photo.naturalWidth}x${scenario.photo.naturalHeight} decoded, displayed ${scenario.photo.displayedWidth}x${scenario.photo.displayedHeight}`
      );
    }
    if (scenario.timers && scenario.name.startsWith("idle")) {
      console.log("active intervals:");
      for (const interval of scenario.timers.intervals) {
        console.log(
          `  every ${interval.delay} ms · ${interval.fires} fires · ${interval.source || interval.stack}`
        );
      }
      console.log("pending timeouts:");
      for (const timeout of scenario.timers.timeouts) {
        console.log(
          `  in ${timeout.remaining} ms (${timeout.delay} ms) · ${timeout.source || timeout.stack}`
        );
      }
      console.log("animations:");
      const grouped = new Map();
      for (const animation of scenario.timers.animations) {
        const key = `${animation.kind} ${animation.name} (${animation.playState})`;
        grouped.set(key, (grouped.get(key) || 0) + 1);
      }
      for (const [key, count] of grouped) console.log(`  ${count}× ${key}`);
    }
    if (scenario.assets) {
      console.log(
        `assets: ${scenario.assets.requests.length} files, ${formatBytes(
          scenario.assets.jsBytes
        )} JS + ${formatBytes(scenario.assets.cssBytes)} CSS`
      );
    }
  }
  console.log(`\nJSON report: ${report.outPath}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });

  let built = false;
  if (!args.baseUrl) {
    if (!args.skipBuild) {
      console.log("Building frontend (with sourcemaps and Vue render counters)...");
      const profileConfig = createProfileConfig();
      await run("npm", ["run", "build", "--", "--sourcemap", "--config", profileConfig], {
        echo: true,
      });
      built = true;
    }
  }

  let preview = null;
  const baseUrl = args.baseUrl || `http://localhost:${PREVIEW_PORT}`;
  if (!args.baseUrl) {
    console.log(`Serving dist/ on ${baseUrl} ...`);
    preview = await startPreview();
  }

  const photoPng = makePhotoPng();
  console.log(`Mock photo: 4032x3024 PNG, ${formatBytes(photoPng.length)}`);

  // Re-bind the image override to the generated buffer. The closure in
  // mockOptions() runs per page; a module-level buffer keeps one allocation.
  const patchedMockOptions = options => {
    const patched = mockOptions(options);
    patched.overrides.unshift([
      /^\/api\/images\/(?!list$|current$|next$|previous$|upload$)[^/]+$/,
      route =>
        route.fulfill({
          status: 200,
          contentType: "image/png",
          body: photoPng,
        }),
    ]);
    return patched;
  };

  let browser = null;
  const scenarios = [];
  const wanted = args.only
    ? new Set(
        args.only
          .split(",")
          .map(item => item.trim())
          .filter(Boolean)
      )
    : null;
  const regionPlan = kinds => [
    { name: "page-switch", label: `page-switch-${kinds.join("-") || "clockbar"}`, kinds },
    { name: "tap", label: `tap-${kinds.join("-") || "clockbar"}`, kinds },
    {
      name: "idle",
      label: `idle-${kinds.join("-") || "clockbar"}`,
      kinds,
      idleMs: IDLE_MS,
      mock: { photoRotationInterval: 30 },
    },
  ];
  const plan = [
    { name: "initial-load", label: "initial-load", kinds: REAL_KINDS, mock: {} },
    ...regionPlan(REAL_KINDS),
    ...regionPlan(["calendar"]),
    ...regionPlan(["photos"]),
    ...regionPlan([]),
    // The owner's real dashboard has no iframe region; keep this one short.
    { name: "page-switch", label: "page-switch-service", kinds: ["service"], mock: {} },
    { name: "tap", label: "tap-service", kinds: ["service"], mock: {} },
    {
      name: "idle",
      label: "idle-service",
      kinds: ["service"],
      idleMs: 10_000,
      mock: {},
    },
    { name: "photo-advance", label: "photo-advance", kinds: REAL_KINDS, mock: {} },
    { name: "menu", label: "menu", kinds: REAL_KINDS, mock: {} },
    {
      name: "osk",
      label: "osk",
      kinds: REAL_KINDS,
      mock: {},
      hasTouch: true,
    },
  ];

  try {
    browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
    for (const item of plan) {
      const label = item.label || item.name;
      if (wanted && !wanted.has(label) && !wanted.has(item.name)) continue;
      console.log(`\nProfiling ${label} ...`);
      const scenario = await runScenario(browser, baseUrl, item.name, {
        label,
        kinds: item.kinds || REAL_KINDS,
        idleMs: item.idleMs,
        hasTouch: item.hasTouch,
        mock: patchedMockOptions({ ...(item.mock || {}), kinds: item.kinds || REAL_KINDS }),
      });
      scenarios.push(scenario);
      console.log(
        `  done: ${
          scenario.metrics
            ? `${Math.round(scenario.metrics.TaskDuration * 1000)} ms main thread`
            : "no metrics"
        }`
      );
    }
  } finally {
    if (browser) await browser.close();
    if (preview) {
      preview.child.kill("SIGTERM");
    }
  }

  const symbolize = makeSymbolizer();
  for (const scenario of scenarios) {
    if (scenario.profile) {
      scenario.profile = summarizeProfile(scenario.profile, symbolize);
    }
    if (scenario.timers) {
      for (const record of [...scenario.timers.intervals, ...scenario.timers.timeouts]) {
        record.source = symbolize.stack(record.stack);
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    cpuThrottle: CPU_THROTTLE,
    idleMs: IDLE_MS,
    build: { built },
    bundle: listBundle(),
    scenarios,
    outPath,
  };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  printSummary(report);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
