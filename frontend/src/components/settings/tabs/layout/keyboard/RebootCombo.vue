<template>
  <CollapsibleSection title="Reboot shortcut" icon="⏻" :expanded="true">
    <div class="reboot-combo">
      <p class="rc-sub">
        Hold two buttons together for a few seconds to reboot the device. Press a slot, then press
        the button you want.
      </p>

      <div class="rc-keys">
        <button
          type="button"
          class="rc-key"
          :class="{ 'rc-key--capturing': capturingSlot === 1 }"
          :aria-label="`First reboot key (currently ${label1})`"
          @click="captureKey(1)"
        >
          <span class="rc-key-cap">{{ capturingSlot === 1 ? "Press a button…" : label1 }}</span>
          <span class="rc-key-hint">first key</span>
        </button>
        <span class="rc-plus" aria-hidden="true">+</span>
        <button
          type="button"
          class="rc-key"
          :class="{ 'rc-key--capturing': capturingSlot === 2 }"
          :aria-label="`Second reboot key (currently ${label2})`"
          @click="captureKey(2)"
        >
          <span class="rc-key-cap">{{ capturingSlot === 2 ? "Press a button…" : label2 }}</span>
          <span class="rc-key-hint">second key</span>
        </button>
      </div>

      <p v-if="warning" class="rc-warn" role="alert">{{ warning }}</p>

      <div class="rc-duration">
        <span class="rc-dur-label">Hold for</span>
        <NumberStepper
          :model-value="durationSeconds"
          :min="1"
          :max="60"
          aria-label="Reboot hold duration in seconds"
          @update:model-value="onDuration"
        />
        <span class="rc-dur-unit">seconds</span>
      </div>

      <p class="rc-hint">{{ comboHint }}</p>
    </div>
  </CollapsibleSection>
</template>

<script setup>
import { ref, computed } from "vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import CollapsibleSection from "@/components/settings/shared/CollapsibleSection.vue";
import { useKeyCapture } from "@/composables/useKeyCapture";
import { formatKeyLabel } from "@/utils/keyCode";

const props = defineProps({
  config: { type: Object, required: true },
});
const emit = defineEmits(["update:config"]);

const { capture, cancel } = useKeyCapture();
const capturingSlot = ref(0); // 0 = idle, 1 = first key, 2 = second key
const warning = ref("");

const key1 = computed(() => props.config.rebootComboKey1 || "KEY_1");
const key2 = computed(() => props.config.rebootComboKey2 || "KEY_7");
const label1 = computed(() => formatKeyLabel(key1.value));
const label2 = computed(() => formatKeyLabel(key2.value));
const durationSeconds = computed(() =>
  Math.round((props.config.rebootComboDuration || 10000) / 1000)
);
const comboHint = computed(
  () => `Hold ${label1.value} + ${label2.value} for ${durationSeconds.value}s to reboot.`
);

const captureKey = async slot => {
  // Clicking the active slot again cancels the capture.
  if (capturingSlot.value) {
    cancel();
    capturingSlot.value = 0;
    return;
  }
  warning.value = "";
  capturingSlot.value = slot;
  try {
    const code = await capture();
    if (!code) return; // Escape / cancelled — keep the current key
    const other = slot === 1 ? key2.value : key1.value;
    if (code === other) {
      // A combo of the same key twice would fire on a single button — reject it.
      warning.value = "The two keys must be different.";
      return;
    }
    emit("update:config", slot === 1 ? { rebootComboKey1: code } : { rebootComboKey2: code });
  } finally {
    capturingSlot.value = 0;
  }
};

const onDuration = secs => {
  const clamped = Math.max(1, Math.min(60, Math.round(secs)));
  emit("update:config", { rebootComboDuration: clamped * 1000 });
};
</script>

<style scoped>
.rc-sub {
  margin: 0 0 16px;
  font-size: 0.85rem;
  color: var(--ink-2);
}
.rc-keys {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rc-key {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 96px;
  min-height: var(--touch-target);
  padding: 10px 14px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.rc-key:hover {
  border-color: var(--focus);
}
.rc-key:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.rc-key--capturing {
  border-color: var(--focus);
  border-style: dashed;
  background: color-mix(in srgb, var(--focus) 12%, var(--bg-1));
}
.rc-key-cap {
  font-family: var(--font-data);
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--ink);
}
.rc-key-hint {
  font-size: 0.7rem;
  color: var(--ink-3);
}
.rc-plus {
  color: var(--ink-3);
  font-size: 1.2rem;
}
.rc-warn {
  margin: 12px 0 0;
  font-size: 0.8rem;
  color: var(--warn);
}
.rc-duration {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 20px;
}
.rc-dur-label {
  color: var(--ink);
  font-size: 0.9rem;
}
.rc-dur-unit {
  color: var(--ink-2);
  font-size: 0.9rem;
}
.rc-hint {
  margin: 16px 0 0;
  font-size: 0.85rem;
  color: var(--ink-2);
}
</style>
