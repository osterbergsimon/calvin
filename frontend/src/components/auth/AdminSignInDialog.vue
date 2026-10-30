<template>
  <template v-if="auth.dialog.open">
    <DialogScrim blur @dismiss="dismiss" />
    <div
      ref="panelEl"
      class="admin-dialog"
      :class="{
        'admin-dialog--wide': showPhoneCard,
        'admin-dialog--phone': isPhone,
        'dialog-above-osk': !isPhone,
        'dialog-above-osk--center': !isPhone,
      }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      @keydown="onKeydown"
    >
      <form
        v-if="auth.dialog.mode === 'signin'"
        class="admin-dialog__form"
        novalidate
        @submit.prevent="submit"
      >
        <h2 :id="titleId" ref="titleEl" class="admin-dialog__title" tabindex="-1">
          {{ action.title }}
        </h2>
        <p class="admin-dialog__lead">{{ action.lead }}</p>

        <input
          class="admin-dialog__username"
          type="text"
          name="username"
          autocomplete="username"
          value="admin"
          readonly
          tabindex="-1"
          aria-hidden="true"
        />

        <p v-if="rateLocked" class="admin-banner admin-banner--err" role="status" aria-live="off">
          Too many wrong passwords. Try again in {{ rateRemaining }}.
        </p>
        <p class="admin-dialog__live" aria-live="polite">{{ liveMessage }}</p>

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

        <p v-if="networkError" class="admin-banner admin-banner--err" role="alert">
          Couldn't reach Calvin. Check the connection and try again.
        </p>

        <div class="admin-dialog__actions">
          <button type="button" class="admin-btn" @click="dismiss">Cancel</button>
          <button
            type="submit"
            class="admin-btn admin-btn--primary"
            :disabled="submitting || rateLocked"
          >
            {{ submitting ? "Signing in…" : "Sign in" }}
          </button>
        </div>
      </form>

      <div v-else class="admin-dialog__form">
        <h2 :id="titleId" ref="titleEl" class="admin-dialog__title" tabindex="-1">
          No admin password yet
        </h2>
        <p class="admin-dialog__lead">{{ action.setupLead }}</p>
        <div class="admin-dialog__actions">
          <button type="button" class="admin-btn" @click="dismiss">Cancel</button>
          <button type="button" class="admin-btn admin-btn--primary" @click="openSettings">
            Open Settings
          </button>
        </div>
      </div>

      <template v-if="showPhoneCard">
        <div class="admin-dialog__seam" aria-hidden="true"><span>or</span></div>
        <PhoneSetupCard
          class="admin-dialog__phone"
          compact
          :setting-id="auth.dialog.mode === 'setup' ? null : action.settingId"
          :title="auth.dialog.mode === 'setup' ? 'Set it up from your phone' : action.phoneTitle"
          :hint="auth.dialog.mode === 'setup' ? undefined : action.phoneHint"
        />
      </template>
    </div>
  </template>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore, authErrorCode, retryAfterSeconds } from "@/stores/auth";
import { useRateLimitCountdown } from "@/composables/useRateLimitCountdown";
import { useOskState } from "@/composables/useOnScreenKeyboard";
import { useTouchCapability } from "@/composables/useTouchCapability";
import { useNotificationsStore } from "@/stores/notifications";
import DialogScrim from "@/components/ui/DialogScrim.vue";
import PasswordField from "@/components/ui/PasswordField.vue";
import PhoneSetupCard from "@/components/ui/PhoneSetupCard.vue";

let dialogSeq = 0;
const titleId = `admin-dialog-title-${++dialogSeq}`;

const auth = useAuthStore();
const router = useRouter();
const notifications = useNotificationsStore();
const { isTouch } = useTouchCapability();
const osk = useOskState();

const action = computed(() => auth.dialog.action);

const password = ref("");
const revealed = ref(false);
const error = ref("");
const networkError = ref(false);
const submitting = ref(false);

const panelEl = ref(null);
const titleEl = ref(null);
const passwordField = ref(null);
let opener = null;

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
const onResize = () => {
  width.value = window.innerWidth;
};
onMounted(() => window.addEventListener("resize", onResize));
onUnmounted(() => window.removeEventListener("resize", onResize));

const isPhone = computed(() => width.value < 480);
const showPhoneCard = computed(() => isTouch.value && width.value >= 720 && !osk.visible.value);

// ── Open / close: focus in, trap, restore ────────────────────────────────────
function focusInitial() {
  nextTick(() => {
    if (isTouch.value) titleEl.value?.focus();
    else passwordField.value?.focus();
  });
}

watch(
  () => auth.dialog.open,
  open => {
    if (open) {
      opener = document.activeElement;
      password.value = "";
      revealed.value = false;
      error.value = "";
      networkError.value = false;
      focusInitial();
    } else if (opener) {
      const restore = opener;
      opener = null;
      nextTick(() => restore?.focus?.());
    }
  }
);

onMounted(() => {
  if (auth.dialog.open) {
    opener = document.activeElement;
    focusInitial();
  }
});

function dismiss() {
  auth.closeSignIn();
}

function focusables() {
  if (!panelEl.value) return [];
  return Array.from(
    panelEl.value.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => el.offsetParent !== null || el === document.activeElement);
}

function onKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    dismiss();
    return;
  }
  if (event.key !== "Tab") return;

  const nodes = focusables();
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !panelEl.value?.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
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
.admin-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 1000;
  width: min(30rem, calc(100vw - 32px));
  padding: 1.5rem;
  color: var(--ink);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-2xl);
  box-shadow: 0 18px 50px -16px var(--shadow-hover);
  transform: translate(-50%, -50%);
}
.admin-dialog--wide {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  width: min(56rem, calc(100vw - 32px));
  padding: 1.75rem;
}
.admin-dialog--phone {
  top: auto;
  bottom: calc(16px + var(--osk-height, 0px));
  transform: translateX(-50%);
}
.admin-dialog__title {
  margin: 0 0 6px;
  font-family: var(--font-ui);
  font-size: var(--fs-xl);
  font-weight: 600;
  line-height: 1.3;
}
.admin-dialog__title:focus {
  outline: none;
}
.admin-dialog__lead {
  margin: 0 0 20px;
  font-size: var(--fs-md);
  line-height: 1.45;
  color: var(--ink-2);
}
.admin-dialog__username {
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
.admin-dialog__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.admin-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}
.admin-dialog--wide .admin-dialog__actions {
  justify-content: stretch;
}
.admin-dialog--wide .admin-dialog__actions .admin-btn {
  flex: 1;
  height: var(--control-height);
}
.admin-dialog__seam {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 8px 24px;
  font-size: var(--fs-md);
  color: var(--ink-3);
}
.admin-dialog__seam::before,
.admin-dialog__seam::after {
  content: "";
  flex: 1;
  width: 1px;
  background: var(--line);
}
.admin-dialog__phone {
  align-self: center;
  flex-direction: column;
  align-items: flex-start;
}

.admin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--touch-target);
  padding: 0 1rem;
  font-family: var(--font-ui);
  font-size: var(--fs-control);
  font-weight: 500;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  cursor: pointer;
  white-space: nowrap;
}
.admin-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.admin-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.admin-btn--primary {
  color: var(--focus-ink);
  background: var(--focus);
  border-color: var(--focus);
  font-weight: 600;
}

.admin-banner {
  display: flex;
  gap: 10px;
  margin: 0 0 20px;
  padding: 12px 14px;
  font-size: var(--fs-md);
  line-height: 1.45;
  color: var(--ink);
  border: 1px solid;
  border-radius: var(--radius-md);
}
.admin-banner--err {
  background: color-mix(in srgb, var(--err) 8%, var(--bg-1));
  border-color: color-mix(in srgb, var(--err) 40%, transparent);
}
</style>
