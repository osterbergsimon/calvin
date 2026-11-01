import { computed, effectScope, reactive, ref, watch } from "vue";

/**
 * One setup prompt for the whole dashboard (CLV-20, spec in
 * docs/design/2026-10-29-one-phone-setup-prompt.md).
 *
 * Two modes, chosen from what the active screen actually shows:
 *   - `welcome`: every content region is setup-empty (first run). One
 *     non-modal welcome card owns the phone hand-off.
 *   - `gaps`: only some regions are setup-empty. No card over real content;
 *     the QR appears once, in the largest empty region that has room for it.
 *   - `none`: nothing is missing.
 *
 * The state is module-level on purpose: LayoutManager/Dashboard, every
 * EmptyState and SetupWelcomeCard share one instance. `setContentRegions` is
 * the screen layout (ordered); `report`/`clear` are the setup-empty regions.
 */

export const SETUP_WELCOME_DISMISSED_KEY = "calvin-setup-welcome-dismissed";

/** A region shorter than this cannot fit the compact QR card (matches the
 *  `@container (max-height: 360px)` rule in EmptyState.vue). */
export const MIN_QR_REGION_HEIGHT = 360;

/** Content kinds that count as setup-empty regions, in the order they are
 *  offered on the welcome checklist. Labels match CLV-17's Settings naming. */
export const SETUP_KINDS = Object.freeze({
  calendar: { label: "Calendars", settingId: "content-calendars" },
  photos: { label: "Photos", settingId: "content-images" },
  service: { label: "Web pages", settingId: "content-services" },
});

const contentRegions = ref([]);
const contentSignature = ref("");
const reports = reactive({});
const welcomeOpen = ref(false);
const settled = ref(false);
const dismissed = ref(readDismissedFlag());

function readDismissedFlag() {
  try {
    return globalThis.localStorage?.getItem(SETUP_WELCOME_DISMISSED_KEY) === "1";
  } catch {
    // Private mode / storage disabled: no persisted dismissal.
    return false;
  }
}

function writeDismissedFlag(value) {
  try {
    if (value) globalThis.localStorage?.setItem(SETUP_WELCOME_DISMISSED_KEY, "1");
    else globalThis.localStorage?.removeItem(SETUP_WELCOME_DISMISSED_KEY);
  } catch {
    // Storage failed: the dismissal still holds for this page load.
  }
}

const missing = computed(() =>
  contentRegions.value
    .filter(region => reports[region.key])
    .map(region => ({
      ...region,
      area: reports[region.key].area,
      fits: reports[region.key].height > MIN_QR_REGION_HEIGHT,
    }))
);

const allEmpty = computed(
  () => contentRegions.value.length > 0 && missing.value.length === contentRegions.value.length
);

const mode = computed(() => {
  if (missing.value.length === 0) return "none";
  return welcomeOpen.value ? "welcome" : "gaps";
});

const qrOwner = computed(() => {
  let owner = null;
  for (const region of missing.value) {
    if (!region.fits) continue;
    // Strictly larger, so a tie keeps the earlier region in layout order.
    if (!owner || region.area > owner.area) owner = region;
  }
  return owner ? owner.key : null;
});

const qrSettingId = computed(() =>
  missing.value.length === 1 ? missing.value[0].settingId : null
);

// One row per content kind present on this screen, deduplicated in layout
// order. `added` means no region of that kind is setup-empty any more.
const items = computed(() => {
  const seen = new Set();
  const rows = [];
  for (const region of contentRegions.value) {
    if (seen.has(region.kind)) continue;
    seen.add(region.kind);
    const meta = SETUP_KINDS[region.kind];
    if (!meta) continue;
    const added = !contentRegions.value.some(
      candidate => candidate.kind === region.kind && reports[candidate.key]
    );
    rows.push({ kind: region.kind, ...meta, added });
  }
  return rows;
});

// The welcome card is latched open while it is on screen so filling one row
// shows a checked "Added" tag instead of tearing the card down while another gap remains.
// It closes on "Not now" or when nothing is missing any more.
const scope = effectScope(true);
scope.run(() => {
  watch(
    [allEmpty, dismissed],
    ([everyRegionEmpty, isDismissed]) => {
      if (isDismissed) {
        welcomeOpen.value = false;
        return;
      }
      if (everyRegionEmpty) welcomeOpen.value = true;
      else if (missing.value.length === 0) welcomeOpen.value = false;
    },
    { immediate: true, flush: "sync" }
  );

  // "Not now" is per device but not forever: clear it only on an observed
  // transition from "something missing" to "nothing missing" after the screen
  // settled — i.e. someone filled the last gap. A first settle before the
  // regions report (slow kiosk) must never wipe the dismissal.
  watch(
    () => missing.value.length,
    (count, previous) => {
      if (count === 0 && previous > 0 && settled.value) clearDismissed();
    },
    { flush: "sync" }
  );
});

/** Ordered content regions of the active screen: [{ key, kind }]. */
function setContentRegions(regions) {
  const next = (regions || [])
    .filter(region => SETUP_KINDS[region.kind])
    .map(region => ({
      key: region.key,
      kind: region.kind,
      settingId: SETUP_KINDS[region.kind].settingId,
    }));
  const signature = next.map(region => `${region.key}:${region.kind}`).join("|");
  if (signature === contentSignature.value) return;

  contentSignature.value = signature;
  // Settle flag first: the array swap drops the missing count to zero and must
  // not look like "the last gap got filled".
  settled.value = false;
  welcomeOpen.value = false;
  contentRegions.value = next;
  for (const key of Object.keys(reports)) delete reports[key];
}

/** Mark a region as showing its setup empty state. */
function report(key, { area = 0, height = 0 } = {}) {
  if (!key) return;
  reports[key] = { area: Number(area) || 0, height: Number(height) || 0 };
  // A region reported: its component mounted, so the screen has settled.
  settled.value = true;
}

/** The region stopped showing a setup empty state (content or unmount). */
function clear(key) {
  if (key) delete reports[key];
}

/** Called once the first round of reports has landed (Dashboard mount). */
function markSettled() {
  settled.value = true;
}

/** The dashboard is going away (Settings, fullscreen): its regions will clear
 *  their reports on unmount, which must not look like "everything configured". */
function detach() {
  settled.value = false;
}

/** "Not now": hide the welcome card on this device only. */
function dismissWelcome() {
  dismissed.value = true;
  welcomeOpen.value = false;
  writeDismissedFlag(true);
}

function clearDismissed() {
  dismissed.value = false;
  writeDismissedFlag(false);
}

/** Test-only: reset the shared state between specs. */
export function _resetSetupPromptForTests() {
  settled.value = false;
  contentRegions.value = [];
  contentSignature.value = "";
  welcomeOpen.value = false;
  for (const key of Object.keys(reports)) delete reports[key];
  dismissed.value = readDismissedFlag();
}

export function useSetupPrompt() {
  return {
    contentRegions,
    missing,
    mode,
    qrOwner,
    qrSettingId,
    items,
    dismissed,
    setContentRegions,
    report,
    clear,
    markSettled,
    dismissWelcome,
    clearDismissed,
    detach,
  };
}
