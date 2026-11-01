<template>
  <Dialog
    :model-value="auth.dialog.open"
    :label="dialogTitle"
    :wide="showPhoneCard"
    :initial-focus="isTouch ? '.admin-signin__title' : '#admin-signin-dialog-password'"
    @close="dismiss"
  >
    <div class="admin-signin" :class="{ 'admin-signin--wide': showPhoneCard }">
      <form
        v-if="auth.dialog.mode === 'signin'"
        class="admin-signin__form"
        novalidate
        @submit.prevent="submit"
      >
        <h2 class="admin-signin__title heading-title" tabindex="-1">{{ action.title }}</h2>
        <p class="admin-signin__lead">{{ action.lead }}</p>

        <input
          class="admin-signin__username"
          type="text"
          name="username"
          autocomplete="username"
          value="admin"
          readonly
          tabindex="-1"
          aria-hidden="true"
        />

        <InlineNote v-if="rateLocked" tone="err" role="status" aria-live="off">
          Too many wrong passwords. Try again in {{ rateRemaining }}.
        </InlineNote>
        <InlineNote aria-live="polite">{{ liveMessage }}</InlineNote>

        <PasswordField
          ref="passwordField"
          v-model="password"
          v-model:revealed="revealed"
          label="Admin password"
          autocomplete="current-password"
          :error="error"
          :disabled="submitting || rateLocked"
          input-id="admin-signin-dialog-password"
        />

        <InlineNote v-if="networkError" tone="err" role="alert">
          Couldn't reach Calvin. Check the connection and try again.
        </InlineNote>

        <div class="admin-signin__actions">
          <Button @click="dismiss">Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            :disabled="rateLocked"
            :loading="submitting"
            loading-label="Signing in…"
          >
            Sign in
          </Button>
        </div>
      </form>

      <div v-else class="admin-signin__form">
        <h2 class="admin-signin__title heading-title" tabindex="-1">No admin password yet</h2>
        <p class="admin-signin__lead">{{ action.setupLead }}</p>
        <div class="admin-signin__actions">
          <Button @click="dismiss">Cancel</Button>
          <Button variant="primary" @click="openSettings">Open Settings</Button>
        </div>
      </div>

      <template v-if="showPhoneCard">
        <div class="admin-signin__seam" aria-hidden="true"><span>or</span></div>
        <PhoneSetupCard
          class="admin-signin__phone"
          compact
          :setting-id="auth.dialog.mode === 'setup' ? null : action.settingId"
          :title="auth.dialog.mode === 'setup' ? 'Set it up from your phone' : action.phoneTitle"
          :hint="auth.dialog.mode === 'setup' ? undefined : action.phoneHint"
        />
      </template>
    </div>
  </Dialog>
</template>

<script setup>
import { isPhone } from "@/styles/breakpoints.js";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore, authErrorCode, retryAfterSeconds } from "@/stores/auth";
import { useRateLimitCountdown } from "@/composables/useRateLimitCountdown";
import { useOskState } from "@/composables/useOnScreenKeyboard";
import { useTouchCapability } from "@/composables/useTouchCapability";
import { useNotificationsStore } from "@/stores/notifications";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import PasswordField from "@/components/ui/PasswordField.vue";
import PhoneSetupCard from "@/components/ui/PhoneSetupCard.vue";

const auth = useAuthStore();
const router = useRouter();
const notifications = useNotificationsStore();
const { isTouch } = useTouchCapability();
const osk = useOskState();

const action = computed(() => auth.dialog.action);
const dialogTitle = computed(() =>
  auth.dialog.mode === "signin" ? action.value.title : "No admin password yet"
);

const password = ref("");
const revealed = ref(false);
const error = ref("");
const networkError = ref(false);
const submitting = ref(false);

const passwordField = ref(null);

const {
  locked: rateLocked,
  remaining: rateRemaining,
  start: startCountdown,
} = useRateLimitCountdown();
const liveMessage = ref("");

watch(rateLocked, lockedNow => {
  if (lockedNow) {
    liveMessage.value = "Too many wrong passwords.";
  } else if (liveMessage.value) {
    liveMessage.value = "You can try again now.";
    nextTick(() => passwordField.value?.focus());
  }
});

watch(password, () => {
  error.value = "";
});

// ── Layout ───────────────────────────────────────────────────────────────────
const width = ref(typeof window === "undefined" ? 1024 : window.innerWidth);
const height = ref(typeof window === "undefined" ? 768 : window.innerHeight);
const onResize = () => {
  width.value = window.innerWidth;
  height.value = window.innerHeight;
};
onMounted(() => window.addEventListener("resize", onResize));
onUnmounted(() => window.removeEventListener("resize", onResize));

const showPhoneCard = computed(
  () => isTouch.value && !isPhone(width.value, height.value) && !osk.visible.value
);

watch(
  () => auth.dialog.open,
  open => {
    if (!open) return;
    password.value = "";
    revealed.value = false;
    error.value = "";
    networkError.value = false;
  }
);

function dismiss() {
  auth.closeSignIn();
}

async function submit() {
  if (submitting.value || rateLocked.value) return;
  error.value = "";
  networkError.value = false;

  if (!password.value) {
    error.value = "Enter the admin password.";
    nextTick(() => passwordField.value?.focus());
    return;
  }

  submitting.value = true;
  try {
    await auth.login(password.value);
    // Never replay the request: close, restore focus and let the person choose again.
    notifications.notify({ severity: "success", message: action.value.toast });
    auth.closeSignIn();
  } catch (err) {
    const code = authErrorCode(err);
    if (err?.response?.status === 429 || code === "rate_limited") {
      startCountdown(retryAfterSeconds(err));
    } else if (code === "setup_required") {
      auth.setDialogMode("setup");
      password.value = "";
      error.value = "";
    } else if (err?.response?.status === 401) {
      error.value = "That's not the admin password.";
      nextTick(() => {
        passwordField.value?.focus();
        passwordField.value?.select();
      });
    } else {
      networkError.value = true;
    }
  } finally {
    submitting.value = false;
  }
}

function openSettings() {
  auth.applyStatus({ configured: false, authenticated: false });
  auth.closeSignIn();
  router.push("/settings");
}
</script>

<style scoped>
.admin-signin--wide {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: var(--gap-group);
}

.admin-signin__form {
  min-width: 0;
}

.admin-signin__title {
  margin: 0 0 var(--gap-1);
  line-height: 1.3;
}

.admin-signin__title:focus {
  /* a11y-allow-no-outline: dialog heading receives programmatic focus only */
  outline: none;
}

.admin-signin__lead {
  margin: 0 0 var(--gap-4);
  font-size: var(--text-body);
  line-height: 1.45;
  color: var(--ink-2);
}

.admin-signin__username {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.admin-signin__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--gap-inline);
  margin-top: var(--gap-2);
}

.admin-signin--wide .admin-signin__actions .btn {
  flex: 1;
}

.admin-signin__seam {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-2);
  margin: var(--gap-1) 0;
  font-size: var(--text-meta);
  color: var(--ink-3);
}

.admin-signin__seam::before,
.admin-signin__seam::after {
  content: "";
  flex: 1;
  width: 1px;
  background: var(--line);
}

.admin-signin__phone {
  align-self: center;
}
</style>
