import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useConfigStore } from "../stores/config";

/**
 * Shared clock-bar logic used by both ClockBarHorizontal and ClockBarVertical.
 *
 * @param {Object} opts
 * @param {() => boolean} opts.enabled         Whether the bar is enabled (reactive getter).
 * @param {() => boolean} opts.showInKiosk     Show when UI is hidden.
 * @param {() => boolean} opts.showInNonKiosk  Show when UI is visible.
 * @param {() => boolean} [opts.previewMode]   When true, always show and use preview overrides.
 * @param {() => number|null} [opts.previewTimeSize]
 * @param {() => number|null} [opts.previewDateSize]
 * @param {() => string|null} [opts.previewLayout]
 * @param {() => number|null} [opts.previewPadding]
 */
export function useClockBar(opts) {
  const configStore = useConfigStore();

  const get = (fn, fallback = null) => (typeof fn === "function" ? fn() : fallback);

  const isPreview = computed(() => !!get(opts.previewMode, false));

  const shouldShow = computed(() => {
    if (isPreview.value) return true;
    if (!get(opts.enabled, true)) return false;
    if (get(opts.showInNonKiosk, false) && configStore.shouldShowUI) return true;
    if (get(opts.showInKiosk, false) && !configStore.shouldShowUI) return true;
    return false;
  });

  const showDate = computed(() => !!configStore.clockShowDate);
  const showSeconds = computed(() => !!configStore.clockShowSeconds);
  const timezone = computed(() => configStore.timezone || null);
  const timeFormat = computed(() => configStore.timeFormat || "24h");

  const fontSize = computed(() => {
    const preview = get(opts.previewTimeSize, null);
    if (isPreview.value && preview !== null) return preview;
    return configStore.clockBarFontSize || 16;
  });

  const dateFontSize = computed(() => {
    const preview = get(opts.previewDateSize, null);
    if (isPreview.value && preview !== null) return preview;
    return configStore.clockBarDateFontSize || 14;
  });

  const layout = computed(() => {
    const preview = get(opts.previewLayout, null);
    if (isPreview.value && preview !== null) return preview;
    return configStore.clockBarLayout || "single-line";
  });

  const barPadding = computed(() => {
    const preview = get(opts.previewPadding, null);
    if (isPreview.value && preview !== null) return preview;
    return configStore.clockBarPadding || 8;
  });

  const currentTime = ref(new Date());
  let timer = null;

  const buildOptions = (base = {}) => {
    const options = {
      hour: "2-digit",
      minute: "2-digit",
      hour12: timeFormat.value === "12h",
      ...base,
    };
    if (showSeconds.value) options.second = "2-digit";
    if (timezone.value) options.timeZone = timezone.value;
    return options;
  };

  const formattedTime = computed(() => {
    const now = currentTime.value;
    try {
      return now.toLocaleTimeString(undefined, buildOptions());
    } catch {
      const fallback = {
        hour: "2-digit",
        minute: "2-digit",
        hour12: timeFormat.value === "12h",
      };
      if (showSeconds.value) fallback.second = "2-digit";
      return now.toLocaleTimeString(undefined, fallback);
    }
  });

  const formattedDate = computed(() => {
    if (!showDate.value) return "";
    const now = currentTime.value;
    const options = {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    if (timezone.value) options.timeZone = timezone.value;
    try {
      return now.toLocaleDateString(undefined, options);
    } catch {
      return now.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  });

  // Tick aligned to the next second (when seconds are shown) or next minute boundary.
  // Avoids drift from a fixed setInterval and skips re-renders the user can't see.
  const scheduleNextTick = () => {
    const now = new Date();
    const delay = showSeconds.value
      ? 1000 - now.getMilliseconds()
      : 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    timer = setTimeout(tick, Math.max(delay, 16));
  };

  const tick = () => {
    timer = null;
    if (shouldShow.value) {
      currentTime.value = new Date();
    }
    scheduleNextTick();
  };

  const stopTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  // Re-align tick cadence when seconds toggle changes.
  watch(showSeconds, () => {
    stopTimer();
    if (shouldShow.value) scheduleNextTick();
  });

  watch(shouldShow, visible => {
    if (visible && !timer) {
      currentTime.value = new Date();
      scheduleNextTick();
    } else if (!visible) {
      stopTimer();
    }
  });

  onMounted(() => {
    if (shouldShow.value) {
      scheduleNextTick();
    }
  });

  onUnmounted(stopTimer);

  return {
    shouldShow,
    showDate,
    formattedTime,
    formattedDate,
    fontSize,
    dateFontSize,
    layout,
    barPadding,
  };
}
