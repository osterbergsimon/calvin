<template>
  <div class="add-kiosk" data-test="add-kiosk-panel">
    <div class="add-kiosk__block">
      <p class="add-kiosk__title">Raspberry Pi</p>
      <p class="add-kiosk__desc">
        On a fresh Raspberry Pi OS, open a terminal (or SSH in) and run the command below. The Pi
        installs the kiosk, reboots into the dashboard and shows up in this list.
      </p>
      <div class="add-kiosk__cmd-row">
        <code class="add-kiosk__cmd" data-test="add-kiosk-command">{{ installCommand }}</code>
        <button
          type="button"
          class="add-kiosk__copy"
          data-test="add-kiosk-copy"
          :disabled="!serverUrl"
          @click="copyCommand"
        >
          {{ copied ? "Copied" : "Copy" }}
        </button>
      </div>
    </div>

    <div class="add-kiosk__block">
      <p class="add-kiosk__title">Any other screen (tablet, TV, laptop)</p>
      <p class="add-kiosk__desc">
        Give it a name, then open this address in its browser — or scan the code with a tablet. It
        registers as a kiosk the first time it loads.
      </p>
      <label class="add-kiosk__name">
        <span>Kiosk name</span>
        <input
          v-model="name"
          type="text"
          maxlength="64"
          autocomplete="off"
          spellcheck="false"
          data-test="add-kiosk-name"
        />
      </label>
      <PhoneSetupCard
        v-if="kioskUrl"
        compact
        :url="kioskUrl"
        title="Open on the new screen"
        hint="Use the same network as this server."
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import PhoneSetupCard from "@/components/ui/PhoneSetupCard.vue";
import { resolveServerUrl } from "@/utils/serverUrl";

// "Add kiosk" (F6): the two real ways a screen becomes a kiosk — the one-command
// Pi installer (CLV-3) and a browser opening the dashboard with ?kiosk=<name>.
const serverUrl = ref("");
const name = ref("kiosk-1");
const copied = ref(false);

// Mirrors the server's kiosk-id allowlist ([A-Za-z0-9._-]{1,64}).
const safeName = computed(() =>
  name.value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 64)
);

const installCommand = computed(() =>
  serverUrl.value
    ? `curl -fsSL ${serverUrl.value}/api/kiosks/install.sh | sudo bash`
    : "Finding this server's address…"
);
const kioskUrl = computed(() =>
  serverUrl.value && safeName.value
    ? `${serverUrl.value}/?kiosk=${encodeURIComponent(safeName.value)}`
    : ""
);

const copyCommand = async () => {
  try {
    await navigator.clipboard.writeText(installCommand.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // No clipboard (plain-HTTP origin) — the command stays selectable on screen.
  }
};

onMounted(async () => {
  serverUrl.value = await resolveServerUrl();
});
</script>

<style scoped>
.add-kiosk {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-lg) 1.25rem var(--space-xl);
}
.add-kiosk__block {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.add-kiosk__title {
  margin: 0;
  font-family: var(--font-ui);
  font-weight: 600;
  color: var(--ink);
}
.add-kiosk__desc {
  margin: 0;
  font-size: 0.9rem;
  color: var(--ink-2);
}
.add-kiosk__cmd-row {
  display: flex;
  align-items: stretch;
  gap: var(--space-sm);
}
.add-kiosk__cmd {
  flex: 1;
  min-width: 0;
  padding: 0.6rem 0.75rem;
  font-family: var(--font-data);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
  user-select: all;
  color: var(--ink);
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.add-kiosk__copy {
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-weight: 600;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
}
.add-kiosk__name {
  display: flex;
  flex-direction: column;
  gap: var(--space-3xs);
  max-width: 20rem;
  font-size: 0.85rem;
  color: var(--ink-2);
}
.add-kiosk__name input {
  min-height: var(--touch-target);
  padding: 0 0.75rem;
  font: inherit;
  font-size: 1rem;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
</style>
