<template>
  <a
    v-if="safe"
    v-bind="$attrs"
    :href="href"
    :target="onKiosk ? undefined : '_blank'"
    rel="noopener noreferrer"
    @click="onClick"
  >
    <slot />
  </a>
  <span v-else v-bind="$attrs"><slot /></span>
  <HandoffOverlay v-if="showQr" :url="href" embed-refused @close="showQr = false" />
</template>

<script setup>
import { computed, ref } from "vue";
import HandoffOverlay from "../plugins/overlays/HandoffOverlay.vue";
import { isKioskDisplay } from "../../utils/kioskId";
import { isHttpUrl } from "../../utils/safeUrl";

defineOptions({ inheritAttrs: false });

// The one way a component links to another site. A kiosk has no tabs or back
// button, so there the link opens the QR handoff instead of navigating; every
// other browser keeps a new tab. A non-http(s) href is shown as plain text.
const props = defineProps({ href: { type: String, default: "" } });

const onKiosk = isKioskDisplay();
const safe = computed(() => isHttpUrl(props.href));
const showQr = ref(false);

const onClick = event => {
  if (!onKiosk) return;
  event.preventDefault();
  showQr.value = true;
};
</script>
