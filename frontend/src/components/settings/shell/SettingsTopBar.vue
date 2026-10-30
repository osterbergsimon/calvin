<template>
  <header class="settings-topbar">
    <div class="settings-topbar__left">
      <span class="settings-topbar__wordmark" aria-label="Calvin">
        CAL<span class="settings-topbar__wordmark-dot">·</span>VIN
      </span>
      <span class="settings-topbar__location" aria-live="polite">{{ locationLabel }}</span>
    </div>

    <div class="settings-topbar__right">
      <div v-if="!locked" class="settings-topbar__pill" :data-state="saveState">
        <span class="settings-topbar__dot" :class="dotClass" aria-hidden="true"></span>
        <span class="settings-topbar__pill-label">{{ pillLabel }}</span>
      </div>
      <button
        v-if="showPhone && !locked"
        class="settings-topbar__phone"
        type="button"
        data-action="phone"
        aria-label="Continue setup on your phone"
        @click="$emit('phone')"
      >
        📱 Use your phone
      </button>
      <button class="settings-topbar__done" type="button" data-action="done" @click="$emit('done')">
        Done
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  categoryLabel: { type: String, required: true },
  sectionLabel: { type: String, default: "" },
  saveState: { type: String, required: true },
  // Touch screens: offer the phone hand-off (QR + LAN URL) — F2.
  showPhone: { type: Boolean, default: false },
  // Locked Settings: only the wordmark, location and Done remain.
  locked: { type: Boolean, default: false },
});

defineEmits(["done", "phone"]);

const locationLabel = computed(() => props.sectionLabel || props.categoryLabel);

const pillLabel = computed(() => {
  switch (props.saveState) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Error";
    default:
      return "All changes saved";
  }
});

const dotClass = computed(() => {
  switch (props.saveState) {
    case "saving":
      return "settings-topbar__dot--warn";
    case "error":
      return "settings-topbar__dot--err";
    default:
      return "settings-topbar__dot--ok";
  }
});
</script>

<style scoped>
.settings-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 48px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-1);
}

/* Left side */
.settings-topbar__left {
  display: flex;
  align-items: center;
  gap: 16px;
  /* Must be allowed to shrink: the right cluster (save state, phone hand-off,
     Done) is fixed-width, and without this a 390px phone ran 39px wide
     (CLV-66). The location label already carries an ellipsis. */
  min-width: 0;
  flex-shrink: 1;
}

.settings-topbar__wordmark {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--ink);
  user-select: none;
  flex-shrink: 0;
}

.settings-topbar__wordmark-dot {
  color: var(--focus);
}

.settings-topbar__location {
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 500;
  color: var(--ink);
  padding-left: 16px;
  border-left: 1px solid var(--line);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Right side */
.settings-topbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-topbar__pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  background: var(--bg-0);
  border: 1px solid var(--line);
}

.settings-topbar__pill-label {
  font-size: 0.8125rem;
  color: var(--ink-2);
}

.settings-topbar__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.settings-topbar__dot--ok {
  background: var(--ok);
}

.settings-topbar__dot--warn {
  background: var(--warn);
}

.settings-topbar__dot--err {
  background: var(--err);
}

.settings-topbar__done {
  background: var(--focus);
  color: var(--focus-ink);
  border: none;
  border-radius: 6px;
  padding: 6px 16px;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.settings-topbar__phone {
  padding: 6px 12px;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink);
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: pointer;
}

.settings-topbar__phone:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* 44px touch targets on touch screens (F8); the 48px bar still fits them. */
@media (any-pointer: coarse) {
  .settings-topbar__done,
  .settings-topbar__phone {
    min-height: var(--touch-target, 2.75rem);
  }
}

/* You are already on the phone: the hand-off lives on a touch kiosk, and the
   button only squeezes the bar on a 390px screen. */
@media (max-width: 600px) {
  .settings-topbar__phone {
    display: none;
  }
}

.settings-topbar__done:hover {
  opacity: 0.88;
}

.settings-topbar__done:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
