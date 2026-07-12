export const SETTINGS_CATEGORY_STORAGE_KEY = "settings_active_category";

export const defaultSettingsCategoryId = "dashboard";

export const settingsCategories = [
  { id: "dashboard", label: "Display", icon: "📐", subtitle: "Layout · appearance · regions" },
  { id: "clock-bar", label: "Clock Bar", icon: "🕐", subtitle: "Time · weather · status tiles" },
  {
    id: "content",
    label: "Content Sources",
    icon: "📦",
    subtitle: "Calendars · photos · services",
  },
  { id: "plugins", label: "Plugins", icon: "🔌", subtitle: "Install · manage · themes" },
  { id: "device", label: "Device", icon: "🖥️", subtitle: "Power · keyboard · hardware" },
  { id: "kiosks", label: "Kiosks", icon: "🖳", subtitle: "Per-device settings" },
  { id: "maintenance", label: "Maintenance", icon: "⚙️", subtitle: "Updates · diagnostics" },
];

export const settingsDestinations = [
  {
    id: "dashboard-layout",
    label: "Layout",
    path: "Display / Layout",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "layout",
    keywords: ["display", "orientation", "flip", "rotation", "landscape", "portrait"],
  },
  {
    id: "dashboard-regions",
    label: "Screens and regions",
    path: "Display / Screens & regions",
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
      "primary region",
      "activate screen",
    ],
  },
  {
    id: "dashboard-ui",
    label: "Appearance",
    path: "Display / Appearance",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "appearance",
    keywords: ["ui", "theme", "appearance", "typeface", "font", "dark mode"],
  },
  {
    id: "dashboard-kiosk",
    label: "Kiosk and wall",
    path: "Display / Kiosk & wall",
    category: "dashboard",
    tabKey: "settings_tab_dashboard",
    tab: "kiosk-touch",
    keywords: [
      "kiosk",
      "wall",
      "touch",
      "touchscreen",
      "controls",
      "hide controls",
      "reveal corner",
      "focus light",
      "spotlight",
      "dim",
      "clock bar",
      "touch size",
    ],
  },
  {
    id: "clock-bar-appearance",
    label: "Clock and status bar",
    path: "Clock Bar / Clock",
    category: "clock-bar",
    tabKey: "settings_tab_clock_bar",
    tab: "appearance",
    keywords: ["clock", "status bar", "date", "seconds", "weather", "font", "logo", "position"],
  },
  {
    id: "clock-bar-items",
    label: "Status bar plugin tiles",
    path: "Clock Bar / Bar Items",
    category: "clock-bar",
    tabKey: "settings_tab_clock_bar",
    tab: "bar-items",
    keywords: ["status bar", "tiles", "items", "components", "plugins", "weather tile"],
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
    id: "content-calendar-display",
    label: "Calendar display",
    path: "Content Sources / Calendar display",
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
    ],
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
    path: "Device / Display Power",
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
    id: "device-notifications",
    label: "Notifications",
    path: "Device / Notifications",
    category: "device",
    tabKey: "settings_tab_device",
    tab: "notifications",
    keywords: ["notifications", "keyboard feedback", "mode indicator", "auto-hide"],
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

export const isKnownSettingsCategory = categoryId =>
  settingsCategories.some(category => category.id === categoryId);

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
