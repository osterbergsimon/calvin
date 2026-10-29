<template>
  <SettingsSection id="security-admin" title="Admin access">
    <div class="admin-access" :class="{ 'admin-access--form-open': formOpen }">
      <SettingRow
        label="Signed in on this device"
        description="Signing out here doesn't sign out other devices."
        :stacked="isPhone"
        status-dot
      >
        <button
          type="button"
          class="security-btn"
          data-test="admin-sign-out"
          :disabled="signingOut"
          @click="signOut"
        >
          {{ signingOut ? "Signing out…" : "Sign out" }}
        </button>
      </SettingRow>

      <SettingRow
        label="Admin password"
        :description="changed ? '' : 'Changing it signs out every other device.'"
        :stacked="isPhone"
      >
        <template v-if="changed" #description>
          <p class="admin-access__success" role="status">
            ✓ Password changed. Other devices were signed out.
          </p>
        </template>
        <button
          v-if="!formOpen"
          type="button"
          class="security-btn"
          data-test="admin-change-password"
          @click="openForm"
        >
          Change password
        </button>
      </SettingRow>

      <form
        v-if="formOpen"
        class="admin-access__form"
        novalidate
        data-test="admin-change-form"
        @submit.prevent="submit"
      >
        <div class="admin-access__fields">
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
        </div>

        <p
          v-if="rateLocked"
          class="admin-access__banner admin-access__banner--err"
          role="status"
          aria-live="off"
        >
          Too many wrong passwords. Try again in {{ rateRemaining }}.
        </p>
        <p class="admin-access__live" aria-live="polite">{{ liveMessage }}</p>
        <p v-if="networkError" class="admin-access__banner admin-access__banner--err" role="alert">
          Couldn't reach Calvin. Check the connection and try again.
        </p>

        <div class="admin-access__actions">
          <button
            type="button"
            class="security-btn"
            data-test="admin-change-cancel"
            @click="closeForm"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="security-btn security-btn--primary"
            data-test="admin-change-submit"
            :disabled="submitting || rateLocked"
          >
            {{ submitting ? "Changing password…" : "Change password" }}
          </button>
        </div>
      </form>
    </div>
  </SettingsSection>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useAuthStore, authErrorCode, retryAfterSeconds } from "@/stores/auth";
import { useRateLimitCountdown } from "@/composables/useRateLimitCountdown";
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
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
const onResize = () => {
  width.value = window.innerWidth;
};
onMounted(() => window.addEventListener("resize", onResize));
onUnmounted(() => window.removeEventListener("resize", onResize));
const isPhone = computed(() => width.value < 720);

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

<style scoped>
@media (max-width: 719px) {
  .admin-access--form-open :deep(.setting-row__desc) {
    display: none;
  }
}
@media (max-width: 719px) {
  .admin-access :deep(.setting-row) {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }
  .admin-access :deep(.setting-row__control) {
    flex-shrink: 1;
    width: 100%;
  }
  .admin-access :deep(.setting-row__control .security-btn) {
    width: 100%;
  }
}

.admin-access__form {
  padding: 0.25rem 1.25rem 1.25rem;
  border-top: 1px solid var(--line-soft);
}
.admin-access__fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0 16px;
  max-width: 40rem;
  margin-bottom: 16px;
}
@media (min-width: 720px) {
  .admin-access__fields {
    grid-template-columns: 1fr 1fr;
  }
}
.admin-access__actions {
  display: flex;
  gap: 10px;
}
.admin-access__success {
  margin: 0.2rem 0 0;
  font-size: var(--fs-md);
  font-weight: 500;
  color: var(--ok);
}
.admin-access__banner {
  display: flex;
  gap: 10px;
  margin: 0 0 16px;
  padding: 12px 14px;
  font-size: var(--fs-md);
  line-height: 1.45;
  color: var(--ink);
  border: 1px solid;
  border-radius: var(--radius-md);
}
.admin-access__banner--err {
  background: color-mix(in srgb, var(--err) 8%, var(--bg-1));
  border-color: color-mix(in srgb, var(--err) 40%, transparent);
}
.admin-access__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
