/**
 * Backend mock for the phone/kiosk end-to-end suite (CLV-66).
 *
 * The real Calvin backend runs as the owner on their own desktop and its
 * /api/system/* routes act on THIS machine (a past screenshot script clicked
 * Reboot and rebooted the owner's PC). Every request is therefore answered by
 * page.route — nothing ever reaches a real server.
 *
 * Host-acting routes are listed in HOST_ACTIONS and recorded, so a test can
 * prove it was intercepted instead of executed. A fallback also fails loudly
 * for any host-acting path a new route forgot to cover.
 */

export const HOST_ACTIONS = [
  /^\/api\/system\/reboot(?:\/|$)/,
  /^\/api\/system\/restart-backend(?:\/|$)/,
  /^\/api\/system\/restart-frontend(?:\/|$)/,
  /^\/api\/system\/reload-ui(?:\/|$)/,
  /^\/api\/system\/update$/,
  /^\/api\/system\/display\//,
  /^\/api\/display\//,
  /^\/api\/kiosks\/[^/]+\/update(?:\/|$)/,
];

export const isHostAction = pathname => HOST_ACTIONS.some(pattern => pattern.test(pathname));

export const sampleConfig = {
  orientation: "landscape",
  orientationFlipped: false,
  applyDisplayRotation: true,
  calendarSplit: 65,
  dashboardScreens: {
    version: 2,
    activeScreenId: "page-home",
    screens: [
      {
        id: "page-home",
        name: "Home",
        layout: {
          version: 1,
          preset: "split_two",
          regions: [
            { id: "region-1", kind: "calendar", instanceIds: [], size: 65 },
            { id: "region-2", kind: "photos", instanceIds: [], size: 35 },
          ],
        },
        activeRegionId: "region-1",
      },
      {
        id: "page-kitchen",
        name: "Kitchen",
        layout: {
          version: 1,
          preset: "single",
          regions: [{ id: "region-1", kind: "calendar", instanceIds: [], size: 100 }],
        },
        activeRegionId: "region-1",
      },
    ],
  },
  availableScreens: ["page-home", "page-kitchen"],
  defaultScreenId: "page-home",
  showWebServices: true,
  photoFrameEnabled: false,
  photoFrameTimeout: 300,
  photoRotationInterval: 30,
  imageDisplayMode: "smart",
  randomizeImages: false,
  showUI: true,
  displayName: "Kitchen",
  modeIndicatorTimeout: 5,
  focusLightMode: "interaction",
  focusLightDimOthers: true,
  touchControls: "auto",
  touchControlSize: "medium",
  tapAnywhereReveal: false,
  hotCornerPosition: "bottom-left",
  hotCornerOpacity: 55,
  hotCornerSize: 64,
  hotCornerLongPressMs: 500,
  timeFormat: "24h",
  weekStartDay: 1,
  showWeekNumbers: false,
  weekendDays: [0, 6],
  showRedDays: false,
  maxVisibleEvents: 4,
  themeMode: "auto",
  selectedTheme: null,
  darkModeStart: 18,
  darkModeEnd: 6,
  displayScheduleEnabled: false,
  displayTimeoutEnabled: false,
  displayTimeout: 0,
  onScreenKeyboard: "auto",
  oskLayout: "qwerty",
  oskExtraLayouts: [],
  keyboardFeedbackEnabled: true,
  keyboardFeedbackMode: "normal",
  rebootComboKey1: "KEY_1",
  rebootComboKey2: "KEY_7",
  rebootComboDuration: 10000,
  timezone: null,
  clockShowDate: false,
  clockShowSeconds: false,
  clockBarMode: "horizontal",
  clockBarShowInKiosk: false,
  clockBarPosition: "top",
  clockBarFontSize: 16,
  clockBarDateFontSize: 14,
  clockBarLayout: "single-line",
  clockBarVerticalLayout: "upright",
  clockBarVerticalFontSize: 18,
  clockBarVerticalDateFontSize: 11,
  clockBarVerticalPadding: 8,
  clockBarPadding: 8,
  clockBarShowPluginItems: true,
  clockBarShowLogo: true,
  uiSize: "default",
  consoleLogEnabled: true,
  consoleLogLevel: "info",
  configPollInterval: 30,
  calendarRefreshInterval: 15,
  gitRepoUrl: null,
  gitBranch: "develop",
  version: "1.6.0",
  frontendVersion: "1.6.0",
};

const calendarPlugin = {
  id: "calendar-ics",
  name: "ICS calendar",
  type: "calendar",
  version: "1.0.0",
  enabled: true,
  description: "Subscribe to an iCalendar (.ics) address",
  instance_label: "calendar",
  instance_config_schema: {
    ical_url: {
      type: "string",
      label: "Calendar address",
      description: "The .ics address to read events from.",
      required: true,
    },
    display_order: { type: "integer", label: "Order", default: 0, hidden: true },
  },
  common_config_schema: { display_order: { type: "integer", default: 0 } },
  ui_actions: [{ type: "test" }],
  display_schema: null,
};

const localPhotosPlugin = {
  id: "image-local",
  name: "Local photos",
  type: "image",
  version: "1.0.0",
  enabled: true,
  description: "Photos uploaded to Calvin",
  instance_label: "photo folder",
  instance_config_schema: { display_order: { type: "integer", default: 0, hidden: true } },
  display_schema: null,
};

const webEmbedPlugin = {
  id: "web-embed",
  name: "Web page",
  type: "service",
  version: "1.0.0",
  enabled: true,
  description: "Show any web page in a region",
  instance_label: "web page",
  instance_config_schema: {
    url: { type: "string", label: "Address", required: true },
    display_order: { type: "integer", default: 0, hidden: true },
  },
  display_schema: { kind: "iframe" },
  statusbar_schema: null,
};

const mealiePlugin = {
  id: "mealie",
  name: "Mealie",
  type: "service",
  version: "1.0.0",
  enabled: true,
  description: "Recipes from Mealie",
  instance_config_schema: {
    url: { type: "string", label: "Mealie address", required: true },
    api_token: { type: "string", label: "API token", required: true, secret: true },
    display_order: { type: "integer", default: 0, hidden: true },
  },
  display_schema: { kind: "card-grid" },
  statusbar_schema: null,
};

const themePlugin = {
  id: "theme-midnight",
  name: "Midnight",
  type: "theme",
  version: "1.0.0",
  enabled: true,
  // A theme kept on disk but failing its load check: the card must say it
  // needs an update instead of pointing at Dashboard › Appearance (CLV-80).
  selectable: false,
  description: "A dark theme",
  display_schema: null,
};

export const samplePlugins = [
  calendarPlugin,
  localPhotosPlugin,
  webEmbedPlugin,
  mealiePlugin,
  themePlugin,
];

const sampleInstances = {
  "calendar-ics": [
    {
      id: "src-family",
      plugin_id: "calendar-ics",
      name: "Family",
      enabled: true,
      running: true,
      display_order: 0,
      config: { ical_url: "https://example.com/family.ics" },
    },
  ],
  "image-local": [],
  "web-embed": [
    {
      id: "svc-weather",
      plugin_id: "web-embed",
      name: "Weather",
      enabled: true,
      running: true,
      display_order: 0,
      config: { url: "https://example.com/weather" },
    },
  ],
  mealie: [
    {
      id: "svc-recipes",
      plugin_id: "mealie",
      name: "Recipes",
      enabled: true,
      running: true,
      display_order: 1,
      config: { url: "https://example.com/mealie", has_value: { api_token: true } },
      has_value: { api_token: true },
    },
  ],
};

const sampleKiosks = [
  {
    id: "hallway",
    name: "Hallway",
    lastSeen: new Date().toISOString(),
    lastAppliedVersion: "1.6.0",
    agentVersion: "1.6.0",
    overrides: {},
    hostname: "hallway-pi",
  },
  {
    id: "workshop",
    name: "Workshop",
    lastSeen: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    lastAppliedVersion: "1.5.2",
    agentVersion: "1.5.2",
    overrides: {},
    hostname: "workshop-pi",
  },
];

const sampleCalendarSources = [
  {
    id: "src-family",
    name: "Family",
    type: "calendar-ics",
    enabled: true,
    color: "green",
    show_time: true,
    ical_url: "https://example.com/family.ics",
  },
];

const sampleImages = [
  { id: "img-1", filename: "garden.jpg", source: "image-local" },
  { id: "img-2", filename: "harbour.jpg", source: "image-local" },
];

const sampleKeys = [
  {
    id: "key-1",
    name: "Home Assistant",
    scope: "read",
    prefix: "calvin_abcd",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    lastUsedAt: null,
  },
];

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/**
 * Install the mock on a page. Returns bookkeeping the tests assert on.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ auth?: object, config?: object, overrides?: Array<[RegExp, Function]> }} options
 */
export async function installApiMock(page, options = {}) {
  const state = {
    auth: { configured: true, authenticated: true, ...(options.auth || {}) },
    // The one-time setup code the phone should send. Kept in the mock so the
    // POST body is checked, not just the field's presence.
    setupCode: "ABCD-EFGH",
    // A phone is not the server: GET /auth/setup-code gives it nothing.
    setupCodeAvailable: false,
    setupBody: null,
    config: { ...sampleConfig, ...(options.config || {}) },
    instances: JSON.parse(JSON.stringify(sampleInstances)),
    hostActions: [],
    // Flip to true to simulate a server that stopped answering every route.
    down: false,
    requests: [],
    unmatched: [],
  };

  await page.route("**/api/**", async route => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;
    state.requests.push(`${method} ${path}`);

    // A server that went away: every route fails, including /health.
    if (state.down) return json(route, { detail: "down" }, 503);

    // A caller-supplied override always wins (used to simulate failures).
    for (const [pattern, handler] of options.overrides || []) {
      if (pattern.test(path)) {
        const handled = await handler(route, { method, path, url, state });
        if (handled !== false) return;
      }
    }

    if (isHostAction(path)) {
      state.hostActions.push(`${method} ${path}`);
      // Fake success: the UI gets a benign answer, nothing leaves the browser.
      return json(route, { ok: true, mocked: true });
    }

    // The real backend answers {status: "healthy", database: "ok"}; "ok" here
    // made the UI say "Not checked yet" beside a check time.
    if (path === "/api/health") return json(route, { status: "healthy", database: "ok" });
    // A phone is never loopback: the code reaches it in the QR's ?setup= link.
    if (path === "/api/auth/setup-code") {
      return json(route, state.setupCodeAvailable ? { code: state.setupCode } : {});
    }
    if (path === "/api/auth/status") return json(route, state.auth);
    if (/^\/api\/auth\/(setup|login|logout|password)$/.test(path)) {
      if (path.endsWith("/logout")) {
        state.auth = { ...state.auth, authenticated: false };
      } else {
        if (path === "/api/auth/setup") {
          state.setupBody = request.postDataJSON();
          if (state.setupBody?.code !== state.setupCode) {
            return json(
              route,
              { detail: { code: "bad_setup_code", message: "Wrong setup code." } },
              403
            );
          }
        }
        state.auth = { configured: true, authenticated: true };
      }
      return json(route, { ok: true });
    }
    if (path === "/api/auth/keys") {
      if (method === "POST") {
        return json(route, {
          key: {
            id: "key-new",
            name: "New key",
            scope: "read",
            prefix: "calvin_new1",
            createdAt: new Date().toISOString(),
          },
          secret: "calvin_new1_secret_value",
        });
      }
      return json(route, { keys: sampleKeys });
    }
    if (/^\/api\/auth\/keys\/[^/]+$/.test(path)) return json(route, { ok: true });

    if (path === "/api/config" && method === "GET") return json(route, state.config);
    if (path === "/api/config" && method === "POST") {
      state.config = { ...state.config, ...request.postDataJSON() };
      return json(route, state.config);
    }
    if (path === "/api/config/git/branches") return json(route, { branches: ["main", "develop"] });

    if (path === "/api/calendar/sources" && method === "GET") {
      return json(route, { sources: sampleCalendarSources });
    }
    if (path === "/api/calendar/sources" && method === "POST") {
      return json(route, { ...sampleCalendarSources[0], ...request.postDataJSON() });
    }
    if (/^\/api\/calendar\/sources\/[^/]+$/.test(path)) {
      return json(route, { ...sampleCalendarSources[0], ...request.postDataJSON() });
    }
    if (path === "/api/calendar/refresh") return json(route, { ok: true });
    if (path === "/api/calendar/events") return json(route, { events: [] });

    if (path === "/api/images/list") return json(route, { images: sampleImages });
    if (path === "/api/images/current") return json(route, { image: sampleImages[0] });
    if (path === "/api/images/next" || path === "/api/images/previous") {
      return json(route, { image: sampleImages[0] });
    }
    if (path === "/api/images/upload") return json(route, { ok: true, images: sampleImages });
    if (/^\/api\/images\/[^/]+$/.test(path) && method === "DELETE") {
      return json(route, { ok: true });
    }
    if (/^\/api\/images\/[^/]+$/.test(path)) {
      // Thumbnails/photo bytes: a real 1x1 PNG so the <img> renders.
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1PX });
    }

    if (path === "/api/plugins" && method === "GET") {
      const type = url.searchParams.get("plugin_type");
      const plugins = type ? samplePlugins.filter(p => p.type === type) : samplePlugins;
      return json(route, { plugins });
    }
    if (path === "/api/plugins/installed") {
      return json(route, {
        plugins: samplePlugins.filter(p => p.id !== "theme-midnight"),
      });
    }
    if (path === "/api/plugins/installed/updates") return json(route, { updates: [] });
    if (path === "/api/plugins/local/suggest") return json(route, { paths: [] });
    if (path === "/api/plugins/local/enumerate") return json(route, { plugins: [] });
    if (path === "/api/plugins/github/enumerate") return json(route, { plugins: [] });
    if (path === "/api/plugins/github/install") return json(route, { manifest: { id: "demo" } });
    if (path === "/api/plugins/inspect") return json(route, { manifest: { id: "demo" } });
    if (path === "/api/plugins/install") return json(route, { manifest: { id: "demo" } });
    if (path === "/api/plugins/instances/order") return json(route, { ok: true });
    if (/^\/api\/plugins\/[^/]+\/instances$/.test(path)) {
      const pluginId = path.split("/")[3];
      if (method === "POST") {
        const body = request.postDataJSON() || {};
        const instance = {
          id: `src-${body.name ? String(body.name).toLowerCase().replace(/\s+/g, "-") : "new"}`,
          plugin_id: pluginId,
          name: body.name,
          enabled: body.enabled !== false,
          running: true,
          display_order: (state.instances[pluginId] || []).length,
          config: body.config || {},
        };
        state.instances[pluginId] = [...(state.instances[pluginId] || []), instance];
        return json(route, { instance });
      }
      return json(route, { instances: state.instances[pluginId] || [] });
    }
    if (/^\/api\/plugins\/[^/]+\/instances\/order$/.test(path)) return json(route, { ok: true });
    if (/^\/api\/plugins\/[^/]+\/config$/.test(path)) return json(route, {});
    if (/^\/api\/plugins\/[^/]+\/(test|fetch|geocode)$/.test(path)) {
      return json(route, { success: true, message: "Looks good", latitude: 0, longitude: 0 });
    }
    if (/^\/api\/plugins\/instances\/[^/]+\/(start|stop)$/.test(path)) {
      return json(route, { ok: true });
    }
    if (/^\/api\/plugins\/instances\/[^/]+$/.test(path)) {
      if (method === "DELETE") return json(route, { ok: true });
      return json(route, request.postDataJSON() || {});
    }
    if (/^\/api\/plugins\/[^/]+$/.test(path)) {
      const pluginId = path.split("/")[3];
      const plugin = samplePlugins.find(p => p.id === pluginId);
      if (plugin) return json(route, plugin);
      return json(route, { detail: "not found" }, 404);
    }

    if (path === "/api/kiosks") return json(route, { kiosks: sampleKiosks });
    if (path === "/api/kiosks/agent/manifest") return json(route, { version: "1.6.0" });
    if (/^\/api\/kiosks\/[^/]+\/overrides$/.test(path)) {
      if (method === "PUT") return json(route, request.postDataJSON() || {});
      return json(route, { overrides: {} });
    }
    if (/^\/api\/kiosks\/[^/]+\/config$/.test(path)) {
      return json(route, { deviceConfigVersion: "3" });
    }

    if (path === "/api/security/sealed-mode") {
      if (method === "PUT") return json(route, request.postDataJSON() || {});
      return json(route, { sealed_mode: false });
    }
    if (path === "/api/security/allowed-origins") {
      if (method === "PUT") return json(route, request.postDataJSON() || {});
      return json(route, { origins: ["https://grafana.local"] });
    }

    if (path === "/api/system/environment") {
      return json(route, {
        backendVersion: "1.6.0",
        frontendVersion: "1.6.0",
        pythonVersion: "3.12.4",
        platform: "Linux",
        hostname: "calvin-pi",
        uptime: 3600,
        deployment: "native",
        host_control: true,
        capabilities: { restart: true, reboot: true },
      });
    }
    if (path === "/api/system/network") {
      return json(route, { public_url: null, lan_urls: ["http://calvin.local:8000"] });
    }
    if (path === "/api/system/update/status") {
      return json(route, {
        // The real API always includes a status; the UI maps idle to "Up to date".
        status: "idle",
        available: false,
        current_version: "1.6.0",
        latest_version: "1.6.0",
        update_available: false,
        branch: "develop",
      });
    }

    if (path === "/api/backup/schedule") {
      if (method === "PUT") return json(route, request.postDataJSON() || {});
      return json(route, { enabled: false, frequency: "weekly", time: "03:00", keep: 3 });
    }
    if (path === "/api/backup/files") return json(route, { files: [] });
    if (path === "/api/backup/export") {
      return route.fulfill({
        status: 200,
        contentType: "application/zip",
        body: Buffer.from("PK"),
      });
    }
    if (path === "/api/backup/preview" || path === "/api/backup/restore") {
      return json(route, { ok: true, files: [] });
    }

    if (path === "/api/keyboard/mappings") {
      if (method === "POST") return json(route, request.postDataJSON() || {});
      return json(route, { mappings: {} });
    }
    if (/^\/api\/keyboard\/mappings\/[^/]+$/.test(path)) {
      return json(route, request.postDataJSON() || {});
    }

    state.unmatched.push(`${method} ${path}`);
    // Unknown route: an empty JSON object keeps the UI rendering instead of
    // hanging on a request that would have hit the real backend.
    return json(route, {});
  });

  // Defence in depth: host-acting routes get their own handlers, registered
  // after the catch-all so they win. A test can click Reboot/Update at will and
  // the request is answered here, never sent to a real Calvin.
  const hostUrlPatterns = [
    /\/api\/system\/reboot(?:\/|\?|$)/,
    /\/api\/system\/restart-backend(?:\/|\?|$)/,
    /\/api\/system\/restart-frontend(?:\/|\?|$)/,
    /\/api\/system\/reload-ui(?:\/|\?|$)/,
    /\/api\/system\/update(?:\?|$)/,
    /\/api\/system\/display\//,
    /\/api\/display\//,
    /\/api\/kiosks\/[^/]+\/update(?:\/|\?|$)/,
  ];
  for (const pattern of hostUrlPatterns) {
    await page.route(pattern, async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      state.hostActions.push(`${request.method()} ${path}`);
      return json(route, { ok: true, mocked: true });
    });
  }

  return state;
}
