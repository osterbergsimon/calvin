<template>
  <div
    class="phone-setup"
    :class="{ 'phone-setup--compact': compact, 'phone-setup--stacked': stacked }"
    data-test="phone-setup"
  >
    <img v-if="qr" class="phone-setup__qr" :src="qr" :alt="`QR code for ${link}`" />
    <div class="phone-setup__text">
      <p class="phone-setup__title">{{ title }}</p>
      <p v-if="hint" class="phone-setup__hint">{{ hint }}</p>
      <code v-if="link" class="phone-setup__url" data-test="phone-setup-url">{{ link }}</code>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import QRCode from "qrcode";
import { resolveServerUrl, settingsLink } from "@/utils/serverUrl";

// "Finish setup on your phone" hand-off (F2): a touch kiosk has no keyboard for
// URLs, file pickers or repo names, so show where the same setting lives on the
// server and a QR code that opens it.
const props = defineProps({
  // ?setting= destination to open on the phone; null opens Settings' landing page.
  settingId: { type: String, default: null },
  // An explicit URL to show instead of a settings deep link.
  url: { type: String, default: "" },
  title: { type: String, default: "Set up from your phone" },
  hint: {
    type: String,
    default: "Typing is easier there — scan the code or open this address on the same network.",
  },
  compact: { type: Boolean, default: false },
  // CLV-20: QR above the text, no border/background — the welcome card's column.
  stacked: { type: Boolean, default: false },
});

const serverUrl = ref("");
const qr = ref("");

const link = computed(
  () => props.url || (serverUrl.value ? settingsLink(serverUrl.value, props.settingId) : "")
);

const qrWidth = computed(() => {
  if (props.stacked) return props.compact ? 132 : 180;
  return props.compact ? 132 : 200;
});

const renderQr = async value => {
  if (!value) {
    qr.value = "";
    return;
  }
  try {
    qr.value = await QRCode.toDataURL(value, { margin: 1, width: qrWidth.value });
  } catch {
    qr.value = "";
  }
};
watch([link, qrWidth], ([value]) => renderQr(value), { immediate: true });

onMounted(async () => {
  if (!props.url) serverUrl.value = await resolveServerUrl();
});
</script>

<style scoped>
.phone-setup {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-xl);
  text-align: left;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.phone-setup--compact {
  gap: var(--space-lg);
  padding: var(--space-lg);
}
.phone-setup__qr {
  flex: none;
  width: 200px;
  height: 200px;
  border-radius: 8px;
  background: #fff; /* QR codes need a light quiet zone in dark themes too */
}
.phone-setup--compact .phone-setup__qr {
  width: 132px;
  height: 132px;
}
/* Embedded in the CLV-20 welcome card: QR above the text, no chrome of its own. */
.phone-setup--stacked {
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
}
.phone-setup--stacked .phone-setup__qr {
  width: 180px;
  height: 180px;
}
.phone-setup--stacked.phone-setup--compact .phone-setup__qr {
  width: 132px;
  height: 132px;
}
.phone-setup__text {
  min-width: 0;
}
.phone-setup__title {
  margin: 0 0 var(--space-2xs);
  font-family: var(--font-ui);
  font-weight: 600;
}
.phone-setup__hint {
  margin: 0 0 var(--space-sm);
  font-size: 0.9rem;
  color: var(--ink-2);
}
.phone-setup__url {
  display: block;
  font-family: var(--font-data);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
  color: var(--ink);
}
.phone-setup--stacked .phone-setup__url {
  font-size: 0.78rem;
}
@media (max-width: 480px) {
  .phone-setup {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
