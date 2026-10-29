<template>
  <Transition name="setup-welcome-fade">
    <section
      v-if="mode === 'welcome'"
      ref="cardEl"
      class="setup-welcome"
      :class="{
        'setup-welcome--compact': compact,
        'setup-welcome--phone': isPhoneWidth,
        'setup-welcome--solo': !isPhoneHandoff,
      }"
      data-test="setup-welcome"
      role="region"
      aria-labelledby="setup-welcome-title"
    >
      <div class="setup-welcome__main">
        <h2 id="setup-welcome-title" class="setup-welcome__title">Let's set up Calvin</h2>
        <p v-if="!compact" class="setup-welcome__lead" data-test="setup-welcome-lead">
          {{ lead }}
        </p>
        <ul class="setup-welcome__list">
          <li
            v-for="(item, index) in items"
            :key="item.kind"
            class="setup-welcome__row"
            data-test="setup-welcome-row"
          >
            <span class="setup-welcome__label">
              {{ item.label }}
              <small v-if="!compact && !item.added" class="setup-welcome__sub">
                Not added yet
              </small>
            </span>
            <span v-if="item.added" class="setup-welcome__done" data-test="setup-welcome-done">
              ✓ Added
            </span>
            <button
              v-else-if="showActions"
              type="button"
              class="setup-welcome__btn"
              :class="{ 'setup-welcome__btn--primary': isPhoneWidth && index === 0 }"
              data-test="setup-welcome-add"
              :data-setting="item.settingId"
              :aria-label="`Add ${item.label.toLowerCase()}`"
              @click="openSetting(item.settingId)"
            >
              {{ addLabel }}
            </button>
          </li>
        </ul>
        <p
          v-if="!showActions && !isPhoneHandoff"
          class="setup-welcome__hint-line"
          data-test="setup-welcome-no-actions"
        >
          Open Settings on a phone or computer to add these.
        </p>
        <div class="setup-welcome__foot">
          <button
            type="button"
            class="setup-welcome__ghost"
            data-test="setup-welcome-dismiss"
            @click="dismiss"
          >
            Not now
          </button>
        </div>
        <p class="setup-welcome__announce" aria-live="polite" data-test="setup-welcome-announce">
          {{ announcement }}
        </p>
      </div>

      <div v-if="isPhoneHandoff" class="setup-welcome__side">
        <PhoneSetupCard
          stacked
          :compact="compact"
          :setting-id="qrSettingId"
          :title="compact ? 'Or use your phone' : 'Set it up from your phone'"
          :hint="compact ? '' : 'Scan the code or open this address on the same network.'"
        />
        <p
          v-if="auth.status === 'setup'"
          class="setup-welcome__auth"
          data-test="setup-welcome-auth"
        >
          Your phone asks you to choose an admin password first.
        </p>
      </div>
    </section>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useConfigStore } from "@/stores/config";
import { useModeStore } from "@/stores/mode";
import { useAuthStore } from "@/stores/auth";
import { usePhoneHandoff } from "@/composables/usePhoneHandoff";
import { useSetupPrompt } from "@/composables/useSetupPrompt";
import { useTouchCapability } from "@/composables/useTouchCapability";
import PhoneSetupCard from "@/components/ui/PhoneSetupCard.vue";

/**
 * First-run welcome card (CLV-20 §4.1): one non-modal card over the dashboard
 * owns the phone hand-off while every content region is still setup-empty.
 * No scrim, no focus trap, no autofocus — the clock bar and ⋯ menu stay live.
 */

// The dashboard area below the clock bar, measured for the fit rules.
const COMPACT_AREA_HEIGHT = 520;
const PHONE_WIDTH = 480;

const router = useRouter();
const configStore = useConfigStore();
const modeStore = useModeStore();
const auth = useAuthStore();
const { isPhoneHandoff, width } = usePhoneHandoff();
const { isTouch } = useTouchCapability();
const setupPrompt = useSetupPrompt();

const { mode, items, qrSettingId } = setupPrompt;

const cardEl = ref(null);
const areaHeight = ref(typeof window === "undefined" ? 0 : window.innerHeight);
let resizeObserver = null;

const isPhoneWidth = computed(() => width.value < PHONE_WIDTH);
// "Add here" belongs to a wall kiosk; a phone/laptop (narrow or fine pointer)
// is already the place you would add things, so it just says "Add".
const addLabel = computed(() => (isTouch.value && !isPhoneWidth.value ? "Add here" : "Add"));
const compact = computed(() => areaHeight.value > 0 && areaHeight.value < COMPACT_AREA_HEIGHT);
const showActions = computed(() => configStore.shouldShowUI);

const lead = computed(() =>
  isPhoneHandoff.value
    ? "Add what this screen shows. Typing is easier on your phone."
    : "Add what this screen shows."
);

const announcement = ref("");
const announcedKinds = new Set();

watch(
  items,
  rows => {
    const addedNow = rows.filter(row => row.added && !announcedKinds.has(row.kind));
    for (const row of rows) if (row.added) announcedKinds.add(row.kind);
    if (addedNow.length) {
      announcement.value = `${addedNow.map(row => row.label).join(", ")} added.`;
    }
  },
  { deep: true }
);

function observeArea() {
  const parent = cardEl.value?.parentElement;
  if (!parent) return;
  const measured =
    parent.clientHeight || parent.getBoundingClientRect?.().height || window.innerHeight;
  areaHeight.value = measured;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect?.height;
      if (height) areaHeight.value = height;
    });
    resizeObserver.observe(parent);
  }
}

function stopObserving() {
  resizeObserver?.disconnect();
  resizeObserver = null;
}

watch(mode, value => {
  if (value !== "welcome") {
    stopObserving();
    return;
  }
  nextTick(observeArea);
});

onMounted(() => {
  if (mode.value === "welcome") observeArea();
  // The admin-password line needs the auth status; the dashboard never asks
  // otherwise (only Settings does).
  if (auth.status === "checking") auth.fetchStatus();
});

onBeforeUnmount(stopObserving);

function openSetting(settingId) {
  modeStore.setMode(modeStore.MODES.SETTINGS);
  router.push({ path: "/settings", query: { setting: settingId } });
}

function dismiss() {
  setupPrompt.dismissWelcome();
}
</script>

<style scoped>
.setup-welcome {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 20;
  width: min(46rem, calc(100% - 32px));
  padding: 1.75rem;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 28px;
  color: var(--ink);
  text-align: left;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 18px 50px -16px var(--shadow-hover);
}
.setup-welcome--solo {
  grid-template-columns: 1fr;
}
/* 800×480-class dashboard: keep the checklist and QR, drop the prose. */
.setup-welcome--compact {
  width: calc(100% - 24px);
  padding: 1.1rem 1.25rem;
  gap: 18px;
}
/* Phone width: 1 column, docked at the bottom. No QR — you can type here. */
.setup-welcome--phone {
  top: auto;
  bottom: 16px;
  transform: translateX(-50%);
  grid-template-columns: 1fr;
  width: calc(100% - 32px);
}
.setup-welcome__title {
  margin: 0 0 6px;
  font-family: var(--font-ui);
  font-size: var(--fs-xl);
  font-weight: 600;
}
.setup-welcome--compact .setup-welcome__title {
  font-size: 1.1rem;
}
.setup-welcome__lead {
  margin: 0 0 14px;
  font-size: 0.95rem;
  color: var(--ink-2);
}
.setup-welcome__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.setup-welcome__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 3.5rem;
  padding: 6px 8px 6px 14px;
}
.setup-welcome--compact .setup-welcome__row {
  min-height: 3rem;
}
.setup-welcome__row + .setup-welcome__row {
  border-top: 1px solid var(--line-soft);
}
.setup-welcome__label {
  font-weight: 500;
}
.setup-welcome__sub {
  display: block;
  font-size: var(--fs-xs);
  color: var(--ink-3);
}
.setup-welcome__done {
  color: var(--ok);
  font-size: var(--fs-sm);
  font-weight: 500;
}
.setup-welcome__btn {
  min-height: var(--touch-target);
  padding: 0 1.1rem;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}
.setup-welcome__btn--primary {
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border-color: var(--focus);
}
.setup-welcome__btn:focus-visible,
.setup-welcome__ghost:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.setup-welcome__foot {
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
}
.setup-welcome__ghost {
  min-height: var(--touch-target);
  padding: 0 0.75rem;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--ink-2);
  background: transparent;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
.setup-welcome__ghost:hover {
  color: var(--ink);
}
.setup-welcome__hint-line {
  margin: 10px 0 0;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.setup-welcome__side {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 15rem;
}
.setup-welcome--compact .setup-welcome__side {
  width: 12.5rem;
}
.setup-welcome__auth {
  margin: 8px 0 0;
  padding-top: 8px;
  font-size: var(--fs-xs);
  color: var(--ink-2);
  border-top: 1px solid var(--line-soft);
}
.setup-welcome__announce {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.setup-welcome-fade-enter-active,
.setup-welcome-fade-leave-active {
  transition: opacity 0.2s ease;
}
.setup-welcome-fade-enter-from,
.setup-welcome-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .setup-welcome-fade-enter-active,
  .setup-welcome-fade-leave-active {
    transition: none;
  }
}
</style>
