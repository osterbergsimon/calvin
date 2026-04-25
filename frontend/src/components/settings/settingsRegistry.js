export const SETTINGS_CATEGORY_STORAGE_KEY = "settings_active_category";

export const defaultSettingsCategoryId = "dashboard";

export const settingsCategories = [
  { id: "dashboard", label: "Dashboard", icon: "📐" },
  { id: "content", label: "Content Sources", icon: "📦" },
  { id: "plugins", label: "Plugins", icon: "🔌" },
  { id: "device", label: "Device", icon: "🖥️" },
  { id: "maintenance", label: "Maintenance", icon: "⚙️" },
];

export const settingsDestinations = [
  {
    id: "dashboard-layout",
    label: "Layout and calendar display",
    path: "Dashboard / Layout",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "layout",
    keywords: [
      "display",
      "orientation",
      "split",
      "calendar",
      "week",
      "time format",
      "meal plan",
    ],
  },
  {
    id: "dashboard-calendar",
    label: "Calendar display",
    path: "Dashboard / Calendar Display",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "calendar",
    keywords: [
      "calendar",
      "week",
      "time format",
      "weekend",
      "red days",
      "events",
    ],
  },
  {
    id: "dashboard-plugin-display",
    label: "Plugin display",
    path: "Dashboard / Plugin Display",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "plugin-display",
    keywords: ["plugin", "display", "meal plan", "mealie", "card size"],
  },
  {
    id: "dashboard-ui",
    label: "Appearance and kiosk UI",
    path: "Dashboard / Appearance",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "appearance",
    keywords: ["ui", "theme", "appearance", "kiosk", "headers", "dark mode"],
  },
  {
    id: "dashboard-clock",
    label: "Clock and status bar",
    path: "Dashboard / Clock",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "clock",
    keywords: ["clock", "status bar", "date", "seconds", "weather"],
  },
  {
    id: "dashboard-notifications",
    label: "Notifications",
    path: "Dashboard / Notifications",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "notifications",
    keywords: ["notifications", "keyboard feedback", "mode indicator"],
  },
  {
    id: "content-calendars",
    label: "Calendar sources and refresh",
    path: "Content Sources / Calendars",
    category: "content",
    tabKey: "settings_tab_content_sources",
    tab: "calendars",
    keywords: ["calendar", "ical", "google", "source", "refresh"],
  },
  {
    id: "content-photos",
    label: "Photo slideshow behavior",
    path: "Content Sources / Photos",
    category: "content",
    tabKey: "settings_tab_content_sources",
    tab: "photos",
    keywords: ["photos", "slideshow", "photo frame", "random", "image mode"],
  },
  {
    id: "content-images",
    label: "Image source ordering",
    path: "Content Sources / Image Sources",
    category: "content",
    tabKey: "settings_tab_content_sources",
    tab: "images",
    keywords: ["image", "ordering", "sources", "plugins"],
  },
  {
    id: "content-services",
    label: "Service source ordering",
    path: "Content Sources / Services",
    category: "content",
    tabKey: "settings_tab_content_sources",
    tab: "services",
    keywords: ["services", "web services", "ordering"],
  },
  {
    id: "plugins",
    label: "Install and manage plugins",
    path: "Plugins",
    category: "plugins",
    keywords: ["plugins", "install", "github", "zip", "themes", "instances"],
  },
  {
    id: "device-power",
    label: "Power, display schedule, and timeout",
    path: "Device / Power & Display",
    category: "device",
    tabKey: "settings_tab_device",
    tab: "power",
    keywords: ["power", "display", "schedule", "timeout", "screen"],
  },
  {
    id: "device-keyboard",
    label: "Keyboard type and mappings",
    path: "Device / Keyboard",
    category: "device",
    tabKey: "settings_tab_device",
    tab: "keyboard",
    keywords: ["keyboard", "buttons", "mappings", "shortcuts"],
  },
  {
    id: "device-reboot",
    label: "Reboot button combo",
    path: "Device / Reboot Combo",
    category: "device",
    tabKey: "settings_tab_device",
    tab: "reboot",
    keywords: ["reboot", "restart", "combo", "keys"],
  },
  {
    id: "device-hardware",
    label: "Hardware and version status",
    path: "Device / Hardware",
    category: "device",
    tabKey: "settings_tab_device",
    tab: "hardware",
    keywords: ["hardware", "version", "status", "backend", "frontend"],
  },
  {
    id: "maintenance-updates",
    label: "Software updates",
    path: "Maintenance / Updates",
    category: "maintenance",
    tabKey: "settings_tab_maintenance",
    tab: "updates",
    keywords: ["updates", "git", "repository", "branch"],
  },
  {
    id: "maintenance-diagnostics",
    label: "Diagnostics and console logging",
    path: "Maintenance / Diagnostics",
    category: "maintenance",
    tabKey: "settings_tab_maintenance",
    tab: "diagnostics",
    keywords: ["diagnostics", "debug", "logs", "polling", "console"],
  },
];

export const isKnownSettingsCategory = (categoryId) =>
  settingsCategories.some((category) => category.id === categoryId);

export const getSettingDestinationById = (destinationId) =>
  settingsDestinations.find((destination) => destination.id === destinationId);

export const getSettingsDestinationSearchText = (destination) =>
  [destination.label, destination.path, ...(destination.keywords || [])]
    .join(" ")
    .toLowerCase();

export const filterSettingsDestinations = (query, limit = 8) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  return settingsDestinations
    .filter((destination) =>
      getSettingsDestinationSearchText(destination).includes(normalizedQuery),
    )
    .slice(0, limit);
};
