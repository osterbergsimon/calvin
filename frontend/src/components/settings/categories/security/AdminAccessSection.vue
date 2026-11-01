<template>
  <SettingsSection id="security-admin" title="Admin access">
    <SettingRow
      label="Signed in on this device"
      description="Signing out here doesn't sign out other devices."
      :stacked="isPhone"
      status-dot
    >
      <Button
        data-test="admin-sign-out"
        :disabled="signingOut"
        :loading="signingOut"
        loading-label="Signing out…"
        @click="signOut"
      >
        Sign out
      </Button>
    </SettingRow>

    <SettingRow label="Admin password" :stacked="isPhone">
      <template #description>
        <InlineNote v-if="changed" tone="ok" role="status">
          Password changed. Other devices were signed out.
        </InlineNote>
        <InlineNote v-else>Changing it signs out every other device.</InlineNote>
      </template>
      <Button v-if="!formOpen" data-test="admin-change-password" @click="openForm">
        Change password
      </Button>
    </SettingRow>

    <SettingRow v-if="formOpen" label="Change password" stacked>
      <form data-test="admin-change-form" novalidate @submit.prevent="submit">
        <PasswordField
          ref="currentField"
          v-model="current"
          v-model:revealed="currentRevealed"
          label="Current password"
          autocomplete="current-password"
          :error="currentError"
          :disabled="submitting || rateLocked"
          input-id="admin-current-password"
        />
        <PasswordField
          ref="newField"
          v-model="next"
          v-model:revealed="nextRevealed"
          label="New password"
          autocomplete="new-password"
          hint="At least 8 characters."
          :error="newError"
          :disabled="submitting || rateLocked"
          input-id="admin-new-password"
        />

        <InlineNote v-if="rateLocked" tone="err" role="status" aria-live="off">
          Too many wrong passwords. Try again in {{ rateRemaining }}.
        </InlineNote>
        <InlineNote aria-live="polite">{{ liveMessage }}</InlineNote>
        <InlineNote v-if="networkError" tone="err" role="alert">
          Couldn't reach Calvin. Check the connection and try again.
        </InlineNote>

        <Button data-test="admin-change-cancel" @click="closeForm">Cancel</Button>
        <Button
          type="submit"
          variant="primary"
          data-test="admin-change-submit"
          :disabled="rateLocked"
          :loading="submitting"
          loading-label="Changing password…"
        >
          Change password
        </Button>
      </form>
    </SettingRow>
  </SettingsSection>
</template>

<script setup>
import { isPhone as isPhoneViewport } from "@/styles/breakpoints.js";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useAuthStore, authErrorCode, retryAfterSeconds } from "@/stores/auth";
import { useRateLimitCountdown } from "@/composables/useRateLimitCountdown";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import PasswordField from "@/components/ui/PasswordField.vue";

const auth = useAuthStore();

const formOpen = ref(false);
const changed = ref(false);
const signingOut = ref(false);
const current = ref("");
const next = ref("");
const currentRevealed = ref(false);
const nextRevealed = ref(false);
const currentError = ref("");
const newError = ref("");
const submitting = ref(false);
const networkError = ref(false);

const currentField = ref(null);
const newField = ref(null);

const {
  locked: rateLocked,
  remaining: rateRemaining,
  start: startCountdown,
  reset: rateReset,
} = useRateLimitCountdown();
const liveMessage = ref("");
watch(rateLocked, lockedNow => {
  if (lockedNow) {
    liveMessage.value = "Too many wrong passwords.";
  } else if (liveMessage.value) {
    liveMessage.value = "You can try again now.";
    nextTick(() => currentField.value?.focus());
  }
});

watch(current, () => {
  currentError.value = "";
});
watch(next, () => {
  newError.value = "";
});

// Phone-width rows stack (C2); a wide embedded editor keeps the side-by-side form.
const width = ref(typeof window === "undefined" ? 1024 : window.innerWidth);
const height = ref(typeof window === "undefined" ? 768 : window.innerHeight);
const onResize = () => {
  width.value = window.innerWidth;
  height.value = window.innerHeight;
};
onMounted(() => window.addEventListener("resize", onResize));
onUnmounted(() => window.removeEventListener("resize", onResize));
const isPhone = computed(() => isPhoneViewport(width.value, height.value));

async function signOut() {
  signingOut.value = true;
  try {
    await auth.logout();
  } finally {
    signingOut.value = false;
  }
}

function openForm() {
  formOpen.value = true;
  changed.value = false;
  networkError.value = false;
  nextTick(() => currentField.value?.focus());
}

function closeForm() {
  formOpen.value = false;
  current.value = "";
  next.value = "";
  currentError.value = "";
  newError.value = "";
  networkError.value = false;
  currentRevealed.value = false;
  nextRevealed.value = false;
  rateReset();
}

function validate() {
  if (!current.value) {
    currentError.value = "Enter your current password.";
    nextTick(() => currentField.value?.focus());
    return false;
  }
  if ([...next.value].length < 8) {
    newError.value = "Use at least 8 characters.";
    nextTick(() => newField.value?.focus());
    return false;
  }
  if (next.value === current.value) {
    newError.value = "Choose a password different from the current one.";
    nextTick(() => newField.value?.focus());
    return false;
  }
  return true;
}

async function submit() {
  if (submitting.value || rateLocked.value) return;
  networkError.value = false;
  if (!validate()) return;

  submitting.value = true;
  try {
    await auth.changePassword(current.value, next.value);
    formOpen.value = false;
    changed.value = true;
    current.value = "";
    next.value = "";
    currentRevealed.value = false;
    nextRevealed.value = false;
  } catch (err) {
    const code = authErrorCode(err);
    if (err?.response?.status === 429 || code === "rate_limited") {
      startCountdown(retryAfterSeconds(err));
    } else if (code === "admin_required") {
      // The global dialog takes over; keep the values so nothing is lost.
    } else if (err?.response?.status === 401) {
      currentError.value = "That's not the current password.";
      nextTick(() => currentField.value?.focus());
    } else if (err?.response?.status === 422 || err?.response?.status === 400) {
      const detail = err.response?.data?.detail;
      newError.value =
        (typeof detail === "string" ? detail : detail?.message) || "Use at least 8 characters.";
      nextTick(() => newField.value?.focus());
    } else {
      networkError.value = true;
    }
  } finally {
    submitting.value = false;
  }
}
</script>
