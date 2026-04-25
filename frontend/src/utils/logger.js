/**
 * Logger utility that respects console log settings from config
 *
 * Log levels (in order of severity):
 * - error: Always shown (critical errors)
 * - warn: Warnings and important notices
 * - info: General information
 * - debug: Detailed debugging information
 */

// Import config store - we'll use a getter function to avoid circular dependencies
let getConfigStore = null;

// Initialize the config store getter
export function initLogger(configStoreGetter) {
  getConfigStore = configStoreGetter;
}

// Log level hierarchy
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Get current log settings from config store
 */
function getLogSettings() {
  if (!getConfigStore) {
    // Fallback: if logger not initialized, default to showing errors and warnings only
    return {
      enabled: false,
      level: "warn",
    };
  }

  try {
    const configStore = getConfigStore();
    return {
      enabled: configStore.consoleLogEnabled ?? true, // Default to enabled for backwards compatibility
      level: configStore.consoleLogLevel ?? "info", // Default to 'info' level
    };
  } catch {
    // If config store not available, default to showing errors and warnings
    return {
      enabled: false,
      level: "warn",
    };
  }
}

/**
 * Check if a log level should be shown
 */
function shouldLog(level) {
  const settings = getLogSettings();

  // If logging is disabled, only show errors
  if (!settings.enabled) {
    return level === "error";
  }

  // Check if the requested level is within the configured level
  const requestedLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  const configuredLevel = LOG_LEVELS[settings.level] ?? LOG_LEVELS.info;

  return requestedLevel <= configuredLevel;
}

/**
 * Format log message with prefix
 */
function formatMessage(level, prefix, ...args) {
  const timestamp = new Date().toISOString();
  const levelUpper = level.toUpperCase();
  return [`[${timestamp}] [${levelUpper}]${prefix ? ` ${prefix}` : ""}`, ...args];
}

/**
 * Log an error message
 */
export function logError(prefix, ...args) {
  if (shouldLog("error")) {
    console.error(...formatMessage("error", prefix, ...args));
  }
}

/**
 * Log a warning message
 */
export function logWarn(prefix, ...args) {
  if (shouldLog("warn")) {
    console.warn(...formatMessage("warn", prefix, ...args));
  }
}

/**
 * Log an info message
 */
export function logInfo(prefix, ...args) {
  if (shouldLog("info")) {
    console.log(...formatMessage("info", prefix, ...args));
  }
}

/**
 * Log a debug message
 */
export function logDebug(prefix, ...args) {
  if (shouldLog("debug")) {
    console.log(...formatMessage("debug", prefix, ...args));
  }
}

/**
 * Convenience function that maps to appropriate log level based on context
 * Use this for general logging that should respect settings
 */
export function log(level = "info", prefix, ...args) {
  switch (level) {
    case "error":
      logError(prefix, ...args);
      break;
    case "warn":
      logWarn(prefix, ...args);
      break;
    case "info":
      logInfo(prefix, ...args);
      break;
    case "debug":
      logDebug(prefix, ...args);
      break;
    default:
      logInfo(prefix, ...args);
  }
}

/**
 * Check if debug logging is enabled
 * Useful for components that want to conditionally enable debug features
 */
export function isDebugEnabled() {
  return shouldLog("debug");
}
