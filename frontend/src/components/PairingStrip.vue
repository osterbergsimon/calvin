<template>
  <aside
    v-if="store.showStrip"
    ref="strip"
    class="pairing-strip"
    aria-labelledby="pairing-strip-title"
  >
    <svg class="pairing-strip__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path :d="mdiCellphoneLink" fill="currentColor" />
    </svg>
    <p id="pairing-strip-title" class="pairing-strip__title">Pair this screen</p>
    <p class="pairing-strip__text">
      On your phone or computer, open Settings › Screens in Calvin and type this code under Pair a
      screen.
    </p>
    <p class="pairing-strip__code" data-test="pairing-code" role="img" :aria-label="codeLabel">
      {{ store.code }}
    </p>
  </aside>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { mdiCellphoneLink } from "@mdi/js";
import { usePairingStore } from "../stores/kioskPairing";

// The pairing strip on the wall (Task 13; docs/design/2026-11-21-kiosk-pairing.md
// §2). It is the last child of .app-shell, in the flow: the dashboard gets
// shorter by its height instead of the code floating over a dashboard pixel.
// It publishes that height as --pairing-strip-h on <html>; the fixed bottom
// items and the full-screen viewers offset themselves by it. Nothing here is
// interactive or a live region: approval happens on a phone, and a code that
// changes every 10 minutes must not interrupt a screen reader.
const store = usePairingStore();

const strip = ref(null);
let observer = null;

const publish = height => {
  const px = Number.isFinite(height) && height > 0 ? height : 0;
  try {
    document.documentElement.style.setProperty("--pairing-strip-h", `${px}px`);
  } catch {
    // No DOM (SSR/tests without jsdom): the CSS fallback is 0px anyway.
  }
};

const measure = () => {
  const node = strip.value;
  if (!node) {
    publish(0);
    return;
  }
  publish(node.getBoundingClientRect().height || node.offsetHeight);
};

const stopObserving = () => {
  observer?.disconnect();
  observer = null;
};

watch(
  () => store.showStrip,
  async visible => {
    stopObserving();
    if (!visible) {
      publish(0);
      return;
    }
    await nextTick();
    if (!strip.value) {
      publish(0);
      return;
    }
    // A synchronous first measurement so the dashboard never paints one frame
    // at the old height; the observer then keeps it in step with the UI scale.
    measure();
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(entries => {
        const entry = entries[0];
        const size = entry?.borderBoxSize;
        // The strip's height includes its padding and top border: --pairing-
        // strip-h must match the box the layout reserves, not the content box.
        const border = Array.isArray(size) ? size[0]?.blockSize : size?.blockSize;
        publish(border ?? entry?.contentRect?.height ?? 0);
      });
      observer.observe(strip.value);
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  stopObserving();
  publish(0);
});

// "K7Q-4MD" → "Code: K 7 Q, 4 M D": the characters are spelled out, with the
// dash read as a comma, so the code is not guessed at as a word (spec §2.5).
const codeLabel = computed(() => {
  const spelled = String(store.code ?? "")
    .split("-")
    .map(part => part.split("").join(" "))
    .join(", ");
  return `Code: ${spelled}`;
});
</script>

<style scoped>
.pairing-strip {
  flex: none;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "icon title code"
    "icon text code";
  align-items: center;
  column-gap: var(--gap-4);
  row-gap: var(--gap-1);
  padding: var(--gap-3) var(--gap-5);
  background: var(--bg-1);
  border-top: 1px solid var(--line);
}

.pairing-strip__icon {
  grid-area: icon;
  align-self: center;
  width: 28px;
  height: 28px;
  color: var(--ink-2);
}

.pairing-strip__title {
  grid-area: title;
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
  color: var(--ink);
  line-height: 1.2;
}

.pairing-strip__text {
  grid-area: text;
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink-2);
  line-height: 1.35;
}

.pairing-strip__code {
  grid-area: code;
  margin: 0;
  font-family: var(--font-data);
  font-size: var(--pairing-code-size);
  font-weight: var(--weight-strong);
  line-height: 1;
  letter-spacing: 0.06em;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Phone width (≤ 600): icon and title on the first line, the text under them,
   and the code on its own line, left-aligned. */
@media (--bp-phone) {
  .pairing-strip {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "icon title"
      "text text"
      "code code";
    align-items: flex-start;
    gap: var(--gap-2);
    padding: var(--gap-3) var(--gap-4);
  }

  .pairing-strip__icon {
    align-self: center;
  }

  .pairing-strip__code {
    justify-self: start;
  }
}
</style>
