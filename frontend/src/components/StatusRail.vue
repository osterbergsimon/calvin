<template>
  <div class="status-rail" aria-live="polite" aria-label="System status">
    <div v-if="overflow > 0" class="status-rail__more">
      {{ overflow }} more
    </div>
    <TransitionGroup name="tile" tag="div" class="status-rail__stack">
      <div
        v-for="n in visible"
        :key="n.id"
        class="annunciator"
        :class="[`annunciator--${n.severity}`, { 'annunciator--sticky': n.persistent }]"
        role="status"
        tabindex="0"
        @click="dismiss(n.id)"
        @keydown.enter.prevent="dismiss(n.id)"
        @keydown.space.prevent="dismiss(n.id)"
      >
        <span class="annunciator__strip" aria-hidden="true" />
        <span class="annunciator__lamp" aria-hidden="true" />
        <div class="annunciator__body">
          <div class="annunciator__eyebrow">{{ n.eyebrow }}</div>
          <div class="annunciator__message">{{ n.message }}</div>
        </div>
        <button
          type="button"
          class="annunciator__close"
          :aria-label="`Dismiss ${n.eyebrow}`"
          @click.stop="dismiss(n.id)"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path :d="mdiClose" fill="currentColor" />
          </svg>
        </button>
        <span
          v-if="!n.persistent"
          class="annunciator__timer"
          aria-hidden="true"
          :style="{ animationDuration: `${n.duration}ms` }"
        />
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { computed, watch, onUnmounted } from "vue";
import { mdiClose } from "@mdi/js";
import { useNotificationsStore } from "../stores/notifications";

const store = useNotificationsStore();

// Keep the corner uncluttered: show the freshest few, count the rest.
const MAX_VISIBLE = 4;

const visible = computed(() => store.items.slice(-MAX_VISIBLE));
const overflow = computed(() => Math.max(0, store.items.length - MAX_VISIBLE));

function dismiss(id) {
  store.dismiss(id);
}

// StatusRail owns the auto-dismiss timers so the store stays pure. Reconcile a
// timer map against the current items: start one for each new transient tile,
// clear any whose tile is gone.
const timers = new Map();

watch(
  () => store.items,
  items => {
    const liveIds = new Set(items.map(n => n.id));

    for (const [id, handle] of timers) {
      if (!liveIds.has(id)) {
        clearTimeout(handle);
        timers.delete(id);
      }
    }

    for (const n of items) {
      if (!n.persistent && !timers.has(n.id)) {
        timers.set(
          n.id,
          setTimeout(() => store.dismiss(n.id), n.duration)
        );
      }
    }
  },
  { deep: true, immediate: true }
);

onUnmounted(() => {
  for (const handle of timers.values()) clearTimeout(handle);
  timers.clear();
});
</script>

<style scoped>
.status-rail {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  width: min(24rem, calc(100vw - 2rem));
  pointer-events: none; /* the backdrop is inert; tiles opt back in below */
}

.status-rail__stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.status-rail__more {
  font-family: var(--font-data);
  font-size: var(--fs-micro);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-3);
  padding-right: 0.15rem;
}

/* ── Annunciator tile ─────────────────────────────────────────── */
.annunciator {
  position: relative;
  pointer-events: auto;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.7rem 0.7rem 0.7rem 0.9rem;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: 0 6px 22px color-mix(in srgb, var(--ink) 16%, transparent);
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.2s,
    transform 0.2s;
}

.annunciator:hover {
  border-color: var(--focus-edge);
}

.annunciator:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Severity edge-strip — the region-strip motif, recolored per severity. */
.annunciator__strip {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--sev);
}

/* ── The signature: an illuminated status lamp ────────────────── */
.annunciator__lamp {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 2px;
  background: var(--sev);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--sev) 60%, transparent),
    0 0 6px 0 var(--sev),
    0 0 14px 1px color-mix(in srgb, var(--sev) 55%, transparent);
  animation: lamp-arrive 0.5s ease-out both;
}

.annunciator--error .annunciator__lamp,
.annunciator--warning .annunciator__lamp {
  animation: lamp-alert 0.9s ease-out both;
}

.annunciator__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.annunciator__eyebrow {
  font-family: var(--font-data);
  font-size: var(--fs-micro);
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--sev);
}

.annunciator__message {
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  line-height: 1.3;
  color: var(--ink);
  /* Wrap long copy but keep the tile compact. */
  overflow-wrap: anywhere;
}

.annunciator__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--touch-target);
  height: var(--touch-target);
  margin: calc(-1 * var(--space-sm)) calc(-1 * var(--space-xs)) calc(-1 * var(--space-sm)) 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ink-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.annunciator__close:hover {
  background: var(--bg-2);
  color: var(--ink);
}

.annunciator__close:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

/* Auto-dismiss readout — a depleting amber focus light along the base. */
.annunciator__timer {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  transform-origin: left center;
  background: var(--focus);
  box-shadow: 0 0 8px 0 var(--focus-edge);
  animation-name: timer-deplete;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

/* Severity → the local --sev channel that lamp/strip/eyebrow all read. */
.annunciator--info {
  --sev: var(--focus);
}
.annunciator--success {
  --sev: var(--ok);
}
.annunciator--warning {
  --sev: var(--warn);
}
.annunciator--error {
  --sev: var(--err);
}

/* ── Motion ───────────────────────────────────────────────────── */
@keyframes lamp-arrive {
  from {
    opacity: 0;
    filter: brightness(2.2);
  }
  to {
    opacity: 1;
    filter: brightness(1);
  }
}

/* Warning-annunciator double-blink on arrival. */
@keyframes lamp-alert {
  0% {
    filter: brightness(2.4);
  }
  20% {
    filter: brightness(1);
  }
  40% {
    filter: brightness(2.4);
  }
  70% {
    filter: brightness(1);
  }
  100% {
    filter: brightness(1);
  }
}

@keyframes timer-deplete {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

/* Tiles slide up into the corner with the house easing. */
.tile-enter-active {
  transition:
    transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1),
    opacity 0.35s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.tile-leave-active {
  transition:
    transform 0.25s ease-in,
    opacity 0.25s ease-in;
  position: absolute;
  width: 100%;
}
.tile-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.tile-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
.tile-move {
  transition: transform 0.25s cubic-bezier(0.2, 0.7, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .annunciator,
  .annunciator__lamp,
  .tile-enter-active,
  .tile-leave-active,
  .tile-move {
    transition: none;
    animation: none;
  }
  /* Keep the countdown meaningful but jump it rather than animate. */
  .annunciator__timer {
    display: none;
  }
}
</style>
