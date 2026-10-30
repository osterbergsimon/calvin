export const SETTINGS_CATEGORY_STORAGE_KEY = "settings_active_category";

export const defaultSettingsCategoryId = "content";

export const settingsCategories = [
  {
    id: "content",
    label: "Content",
    icon: "📦",
    subtitle: "Calendars · photos · web pages",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "📐",
    subtitle: "Screens · clock bar · theme · touch",
  },
  {
    id: "device",
    label: "Screen & keyboard",
    icon: "🖥️",
    subtitle: "Orientation · power · keyboard",
  },
  { id: "kiosks", label: "Kiosks", icon: "📺", subtitle: "Per-device settings" },
  { id: "plugins", label: "Plugins", icon: "🔌", subtitle: "Install · manage" },
  {
    id: "maintenance",
    label: "System",
    icon: "⚙️",
    subtitle: "Updates · backup · diagnostics",
  },
  {
    id: "security",
    label: "Security",
    icon: "🔒",
    subtitle: "Admin password · allowed origins · network access",
  },
];

// A retired category still resolves, so a stored session value or an old link
// never falls back to the default. Clock Bar is now part of Dashboard.
export const settingsCategoryAliases = {
  "clock-bar": "dashboard",
};

export const settingsDestinations = [
  {
    id: "dashboard-layout",
    label: "Screen orientation",
    path: "Screen & keyboard / Screen orientation",
    category: "device",
    tabKey: "settings_tab_device",
    tab: "layout",
    keywords: ["display", "orientation", "flip", "rotation", "landscape", "portrait"],
  },
  {
    id: "dashboard-regions",
    label: "Pages and regions",
    path: "Dashboard / Pages & regions",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "regions",
    keywords: [
      "screens",
      "regions",
      "layout",
      "split",
      "multi-screen",
      "dashboard",
      "display",
      "primary region",
      "activate screen",
    ],
  },
  {
    id: "dashboard-ui",
    label: "Appearance",
    path: "Dashboard / Appearance",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "appearance",
    keywords: ["ui", "display", "theme", "appearance", "typeface", "font", "dark mode"],
  },
  {
    id: "dashboard-kiosk",
    label: "Controls",
    path: "Dashboard / Controls",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "kiosk-touch",
    keywords: [
      "kiosk",
      "wall",
      "controls",
      "hide controls",
      "keep clock bar",
      "tap anywhere",
      "show-controls corner",
      "reveal corner",
      "corner visibility",
      "corner size",
      "hold for",
    ],
  },
  {
    id: "dashboard-kiosk-focus",
    label: "Touch and focus",
    path: "Dashboard / Touch & focus",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "kiosk-touch-focus",
    keywords: [
      "touch",
      "touchscreen",
      "focus light",
      "spotlight",
      "dim",
      "focus",
      "dashboard size",
      "touch size",
    ],
  },
  {
    id: "clock-bar-appearance",
    label: "Clock",
    path: "Dashboard / Clock",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "clock",
    keywords: [
      "clock",
      "clock bar",
      "status bar",
      "date",
      "seconds",
      "weather",
      "font",
      "logo",
      "position",
    ],
  },
  {
    id: "clock-bar-items",
    label: "Clock bar items",
    path: "Dashboard / Clock bar items",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "bar-items",
    keywords: [
      "clock bar",
      "status bar",
      "tiles",
      "items",
      "components",
      "plugins",
      "weather tile",
    ],
  },
  {
    id: "content-calendars",
    label: "Calendar sources and refresh",
    path: "Content / Calendars",
    category: "content",
    tabKey: "settings_tab_content_sources",
    tab: "calendars",
    keywords: ["calendar", "ical", "google", "source", "refresh", "content sources"],
  },
  {
    id: "content-calendar-display",
    label: "Calendar display",
    path: "Content / Calendar display",
    category: "content",
    tabKey: "settings_tab_content_sources",
    tab: "calendar-display",
    keywords: [
      "calendar",
      "week",
      "time format",
      "weekend",
      "red days",
      "holidays",
      "events",
      "view",
      "content sources",
    ],
  },
  {
    id: "content-photos",
    label: "Photo slideshow behavior",
    path: "Content / Photos",
    category: "content",
    tabKey: "settings_tab_content_sources",
    tab: "photos",
    keywords: ["photos", "slideshow", "photo frame", "random", "image mode", "content sources"],
  },
  {
    id: "content-images",
    label: "Upload photos and order image sources",
    path: "Content / Image sources",
    category: "content",
    tabKey: "settings_tab_content_sources",
    tab: "images",
    keywords: [
      "image",
      "photos",
      "upload",
      "add",
      "ordering",
      "sources",
      "plugins",
      "content sources",
    ],
  },
  {
    id: "content-services",
    label: "Web pages and services",
    path: "Content / Web pages & services",
    category: "content",
    tabKey: "settings_tab_content_sources",
    tab: "content-services",
    keywords: ["services", "web services", "web pages", "ordering", "content sources"],
  },
  {
    id: "plugins",
    label: "Install and manage plugins",
    path: "Plugins",
    category: "plugins",
    keywords: ["plugins", "install", "github", "zip", "themes", "instances"],
  },
  {
    id: "plugins-services",
    label: "Add a web page",
    path: "Content / Web pages & services",
    category: "content",
    tabKey: "settings_tab_content_sources",
    tab: "content-services",
    keywords: ["services", "web services", "web page", "iframe", "add", "url", "content sources"],
  },
  {
    id: "kiosks",
    label: "Add and manage kiosks",
    path: "Kiosks",
    category: "kiosks",
    keywords: ["kiosk", "add kiosk", "install", "raspberry pi", "screen", "device", "qr"],
  },
  {
    id: "kiosks-software",
    label: "Update kiosk software",
    path: "Kiosks / Kiosk software",
    category: "kiosks",
    section: "kiosks-list",
    keywords: ["kiosk", "agent", "update", "software", "version", "bundle", "fleet"],
  },
  {
    id: "device-power",
    label: "Power, display schedule, and timeout",
    path: "Screen & keyboard / Screen power",
    category: "device",
    tabKey: "settings_tab_device",
    tab: "power",
    keywords: ["power", "display", "schedule", "timeout", "screen"],
  },
  {
    id: "device-keyboard",
    label: "On-screen keyboard and layout",
    path: "Screen & keyboard / On-screen keyboard",
    category: "device",
    tabKey: "settings_tab_device",
    tab: "keyboard",
    // "language" stays a search keyword only: people who think of keyboard
    // layouts as languages still find it, but the setting is a layout.
    keywords: [
      "keyboard",
      "on-screen",
      "typing",
      "osk",
      "layout",
      "keyboard layout",
      "language",
      "svenska",
      "åäö",
      "hardware keyboard",
      "physical keyboard",
      "turn off keyboard",
      "buttons",
      "mappings",
      "shortcuts",
    ],
  },
  {
    id: "device-notifications",
    label: "Remote and buttons",
    path: "Screen & keyboard / Remote & buttons",
    category: "device",
    tabKey: "settings_tab_device",
    tab: "notifications",
    keywords: [
      "notifications",
      "key-press",
      "key press",
      "keyboard feedback",
      "mode indicator",
      "auto-hide",
    ],
  },
  {
    id: "device-reboot",
    label: "Reboot button combo",
    path: "Screen & keyboard / Remote & buttons",
    category: "device",
    tabKey: "settings_tab_device",
    tab: "reboot",
    keywords: ["reboot", "restart", "combo", "keys"],
  },
  {
    id: "device-hardware",
    label: "Hardware and version status",
    path: "System / Versions & status",
    category: "maintenance",
    tabKey: "settings_tab_maintenance",
    tab: "hardware",
    keywords: ["hardware", "device", "version", "versions", "status", "backend", "frontend"],
  },
  {
    id: "security-admin",
    label: "Admin access",
    path: "Security / Admin access",
    category: "security",
    tabKey: "settings_tab_security",
    tab: "admin",
    keywords: ["password", "sign out", "admin", "lock", "admin password", "security"],
  },
  {
    id: "maintenance-updates",
    label: "Software updates",
    path: "System / Updates",
    category: "maintenance",
    tabKey: "settings_tab_maintenance",
    tab: "updates",
    keywords: ["updates", "git", "maintenance", "kiosk update", "agent"],
  },
  {
    id: "maintenance-backup",
    label: "Backup and restore",
    path: "System / Backup & restore",
    category: "maintenance",
    tabKey: "settings_tab_maintenance",
    tab: "backup",
    keywords: [
      "backup",
      "restore",
      "export",
      "import",
      "migrate",
      "seed",
      "copy settings",
      "maintenance",
    ],
  },
  {
    // Installer-facing rows that live behind the closed Advanced disclosure.
    // Search is the intended way in: a hit opens the section (§4).
    id: "maintenance-diagnostics",
    label: "Advanced: update source, logging and change checking",
    path: "System / Advanced",
    category: "maintenance",
    tabKey: "settings_tab_maintenance",
    tab: "diagnostics",
    keywords: [
      "advanced",
      "diagnostics",
      "debug",
      "logs",
      "console",
      "console logging",
      "log level",
      "polling",
      "config polling",
      "check for setting changes",
      "repository",
      "branch",
      "git",
      "maintenance",
    ],
  },
];

export const normalizeSettingsCategoryId = categoryId => {
  if (typeof categoryId !== "string") return null;
  const resolved = settingsCategoryAliases[categoryId] ?? categoryId;
  return settingsCategories.some(category => category.id === resolved) ? resolved : null;
};

export const isKnownSettingsCategory = categoryId =>
  normalizeSettingsCategoryId(categoryId) !== null;

export const getSettingDestinationById = destinationId =>
  settingsDestinations.find(destination => destination.id === destinationId);

export const getSettingsDestinationSearchText = destination =>
  [destination.label, destination.path, ...(destination.keywords || [])].join(" ").toLowerCase();

export const filterSettingsDestinations = (query, limit = 8) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  return settingsDestinations
    .filter(destination => getSettingsDestinationSearchText(destination).includes(normalizedQuery))
    .slice(0, limit);
};
