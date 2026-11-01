<template>
  <Transition name="setup-welcome-fade">
    <Card
      v-if="mode === 'welcome'"
      ref="cardEl"
      class="setup-welcome"
      :class="{
        'setup-welcome--compact': compact,
        'setup-welcome--phone': isPhone,
        'setup-welcome--solo': !isPhoneHandoff,
      }"
      data-test="setup-welcome"
      role="region"
      aria-labelledby="setup-welcome-title"
    >
      <div class="setup-welcome__main">
        <h2
          id="setup-welcome-title"
          class="setup-welcome__title"
          :class="compact ? 'heading-group' : 'heading-title'"
        >
          Let's set up Calvin
        </h2>
        <p v-if="!compact" class="setup-welcome__lead" data-test="setup-welcome-lead">
          {{ lead }}
        </p>
        <div class="setup-welcome__list">
          <ListRow
            v-for="(item, index) in items"
            :key="item.kind"
            :name="item.label"
            :meta="!compact && !item.added ? ['Not added yet'] : []"
            data-test="setup-welcome-row"
          >
            <template v-if="item.added || showActions" #actions>
              <Tag v-if="item.added" tone="ok" :icon="mdiCheck" data-test="setup-welcome-done">
                Added
              </Tag>
              <Button
                v-else
                :variant="isPhone && index === 0 ? 'primary' : 'secondary'"
                size="sm"
                data-test="setup-welcome-add"
                :data-setting="item.settingId"
                :aria-label="`Add ${item.label.toLowerCase()}`"
                @click="openSetting(item.settingId)"
              >
                {{ addLabel }}
              </Button>
            </template>
          </ListRow>
        </div>
        <InlineNote
          v-if="!showActions && !isPhoneHandoff"
          class="setup-welcome__hint-line"
          data-test="setup-welcome-no-actions"
        >
          Open Settings on a phone or computer to add these.
        </InlineNote>
        <div class="setup-welcome__foot">
          <Button variant="ghost" size="sm" data-test="setup-welcome-dismiss" @click="dismiss">
            Not now
          </Button>
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
          :setup-code="setupCode"
          :title="compact ? 'Or use your phone' : 'Set it up from your phone'"
          :hint="compact ? '' : 'Scan the code or open this address on the same network.'"
        />
        <InlineNote
          v-if="auth.status === 'setup'"
          class="setup-welcome__auth"
          data-test="setup-welcome-auth"
        >
          Your phone asks you to choose an admin password first.
        </InlineNote>
      </div>
    </Card>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { mdiCheck } from "@mdi/js";
import { useRouter } from "vue-router";
import { useConfigStore } from "@/stores/config";
import { useModeStore } from "@/stores/mode";
import { useAuthStore } from "@/stores/auth";
import { usePhoneHandoff } from "@/composables/usePhoneHandoff";
import { useSetupPrompt } from "@/composables/useSetupPrompt";
import { useSetupCode } from "@/composables/useSetupCode";
import { useTouchCapability } from "@/composables/useTouchCapability";
import PhoneSetupCard from "@/components/ui/PhoneSetupCard.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ListRow from "@/components/ui/ListRow.vue";
import Tag from "@/components/ui/Tag.vue";

/**
 * First-run welcome card (CLV-20 §4.1): one non-modal card over the dashboard
 * owns the phone hand-off while every content region is still setup-empty.
 * No scrim, no focus trap, no autofocus — the clock bar and ⋯ menu stay live.
 */

// The dashboard area below the clock bar, measured for the fit rules.
const COMPACT_AREA_HEIGHT = 520;

const router = useRouter();
const configStore = useConfigStore();
const modeStore = useModeStore();
const auth = useAuthStore();
const { isPhoneHandoff, isPhone } = usePhoneHandoff();
const { isTouch } = useTouchCapability();
const setupPrompt = useSetupPrompt();
const { code: setupCode, load: loadSetupCode } = useSetupCode();

const { mode, items, qrSettingId } = setupPrompt;

// Only the server's own screen can read the code; the QR carries it so the
// phone does not have to type it. Phones and LAN clients get an empty string.
watch(
  () => auth.status,
  status => {
    if (status === "setup") loadSetupCode();
  },
  { immediate: true }
);

const cardEl = ref(null);
const areaHeight = ref(typeof window === "undefined" ? 0 : window.innerHeight);
let resizeObserver = null;

// "Add here" belongs to a wall kiosk; a phone/laptop (narrow or fine pointer)
// is already the place you would add things, so it just says "Add".
const addLabel = computed(() => (isTouch.value && !isPhone.value ? "Add here" : "Add"));
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
  const el = cardEl.value?.$el || cardEl.value;
  const parent = el?.parentElement;
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
/* Card owns the surface; the welcome card only positions itself over the
   dashboard and lays out its two columns. */
.setup-welcome {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: var(--z-raised);
  width: min(46rem, calc(100% - var(--gap-6)));
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--gap-6);
  color: var(--ink);
  text-align: left;
}
.setup-welcome--solo {
  grid-template-columns: 1fr;
}
/* 800×480-class dashboard: keep the checklist and QR, drop the prose. */
.setup-welcome--compact {
  width: calc(100% - var(--gap-5));
  gap: var(--gap-4);
}
/* Phone: 1 column, docked at the bottom. No QR — you can type here. */
.setup-welcome--phone {
  top: auto;
  bottom: var(--gap-4);
  transform: translateX(-50%);
  grid-template-columns: 1fr;
  width: calc(100% - var(--gap-6));
}
.setup-welcome__title {
  margin: 0 0 var(--gap-1);
}
.setup-welcome__lead {
  margin: 0 0 var(--gap-3);
  font-size: var(--text-body);
  color: var(--ink-2);
}
.setup-welcome__list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-2);
}
.setup-welcome__foot {
  display: flex;
  justify-content: flex-start;
  margin-top: var(--gap-2);
}
.setup-welcome__hint-line {
  margin-top: var(--gap-2);
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
  margin-top: var(--gap-3);
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
  transition: opacity var(--dur) var(--ease);
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
