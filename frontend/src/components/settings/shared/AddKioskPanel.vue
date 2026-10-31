<template>
  <div class="add-kiosk" data-test="add-kiosk-panel">
    <Card title="Raspberry Pi">
      <div class="add-kiosk__block">
        <InlineNote>
          On a fresh Raspberry Pi OS, open a terminal (or SSH in) and run the command below. The Pi
          installs the kiosk, reboots into the dashboard and shows up in this list.
        </InlineNote>
        <div class="add-kiosk__cmd-row">
          <code class="add-kiosk__cmd" data-test="add-kiosk-command">{{ installCommand }}</code>
          <Button data-test="add-kiosk-copy" :disabled="!serverUrl" @click="copyCommand">
            {{ copied ? "Copied" : "Copy" }}
          </Button>
        </div>
      </div>
    </Card>

    <Card title="Any other screen (tablet, TV, laptop)">
      <div class="add-kiosk__block">
        <InlineNote>
          Give it a name, then open this address in its browser — or scan the code with a tablet. It
          registers as a kiosk the first time it loads.
        </InlineNote>
        <TextField
          v-model="name"
          label="Kiosk name"
          data-test="add-kiosk-name"
          maxlength="64"
          autocomplete="off"
        />
        <PhoneSetupCard
          v-if="kioskUrl"
          compact
          :url="kioskUrl"
          title="Open on the new screen"
          hint="Use the same network as this server."
        />
      </div>
    </Card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import TextField from "@/components/ui/TextField.vue";
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
  gap: var(--gap-6);
  padding: var(--panel-pad-y) var(--panel-pad-x);
}

.add-kiosk__block {
  display: flex;
  flex-direction: column;
  gap: var(--gap-3);
}

.add-kiosk__cmd-row {
  display: flex;
  align-items: stretch;
  gap: var(--gap-inline);
}

.add-kiosk__cmd {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: var(--gap-2) var(--gap-3);
  overflow-wrap: anywhere;
  user-select: all;
  font-family: var(--font-data);
  font-size: var(--text-meta);
  color: var(--ink);
  background: var(--bg-0);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}
</style>
