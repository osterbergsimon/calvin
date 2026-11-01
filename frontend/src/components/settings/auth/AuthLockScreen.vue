<template>
  <div
    class="auth-lock"
    :class="{
      'auth-lock--kiosk': showPhone,
      'auth-lock--short': isShort,
      'auth-lock--phone': isPhone,
      'auth-lock--osk-up': oskVisible,
      'auth-lock--osk-collapsed': oskCollapsed,
    }"
  >
    <p
      v-if="auth.status === 'checking'"
      class="auth-lock__checking"
      :class="{ 'is-hidden': !checkingReady }"
    >
      Checking…
    </p>

    <div v-else class="auth-lock__row">
      <form
        v-if="auth.status === 'unreachable'"
        class="auth-card"
        data-test="auth-unreachable"
        @submit.prevent="retry"
      >
        <Card>
          <h1 class="auth-card__title heading-title">Can't reach Calvin</h1>
          <p class="auth-card__lead">
            Settings can't check whether you're signed in. Check that the server is running and this
            device is on the same network.
          </p>
          <Button
            type="submit"
            variant="primary"
            class="auth-card__submit"
            :disabled="retrying"
            :loading="retrying"
          >
            {{ retrying ? "Checking…" : "Try again" }}
          </Button>
        </Card>
      </form>

      <form v-else class="auth-card" novalidate data-test="auth-card" @submit.prevent="submit">
        <Card>
          <div v-if="showIcon" class="auth-card__icon" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>

          <h1 v-if="!oskCollapsed" class="auth-card__title heading-title">{{ title }}</h1>

          <InlineNote v-if="notice" class="auth-card__notice" tone="warn" role="status">
            {{ notice }}
          </InlineNote>
          <p v-else-if="!oskCollapsed" class="auth-card__lead">{{ lead }}</p>

          <!-- Password managers attach saved passwords to one consistent account. -->
          <input
            class="auth-card__username"
            type="text"
            name="username"
            autocomplete="username"
            value="admin"
            readonly
            tabindex="-1"
            aria-hidden="true"
          />

          <InlineNote
            v-if="rateLocked"
            class="auth-card__notice"
            tone="err"
            role="status"
            aria-live="off"
          >
            {{ rateMessage }}
          </InlineNote>
          <p class="auth-card__live" aria-live="polite">{{ liveMessage }}</p>

          <div v-if="mode === 'setup'" class="auth-card__fields">
            <PasswordField
              ref="codeField"
              v-model="setupCode"
              type="text"
              label="Setup code"
              autocomplete="one-time-code"
              autocapitalize="characters"
              :maxlength="9"
              :error="error3"
              :disabled="submitting || rateLocked"
              input-id="auth-setup-code"
            >
              <template #hint>
                <template v-if="codePrefilled">{{ codePrefillHint }}</template>
                <template v-else>
                  Calvin printed it in its log when it first started.
                  <a
                    class="auth-card__hint-link"
                    href="https://osterbergsimon.github.io/calvin/setup/GETTING_STARTED/#first-sign-in"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Where to find it</a
                  >
                </template>
              </template>
            </PasswordField>
            <PasswordField
              ref="firstField"
              v-model="password"
              v-model:revealed="revealed"
              label="Password"
              autocomplete="new-password"
              hint="At least 8 characters."
              :error="error1"
              :disabled="submitting || rateLocked"
              input-id="auth-setup-password"
              @blur="onFirstBlur"
            />
            <PasswordField
              ref="secondField"
              v-model="repeat"
              :revealed="revealed"
              label="Repeat password"
              autocomplete="new-password"
              :show-toggle="false"
              :error="error2"
              :disabled="submitting || rateLocked"
              input-id="auth-setup-repeat"
              @blur="onSecondBlur"
            />
          </div>

          <div v-else class="auth-card__fields">
            <PasswordField
              ref="firstField"
              v-model="password"
              v-model:revealed="revealed"
              label="Admin password"
              autocomplete="current-password"
              :error="error1"
              :disabled="submitting || rateLocked"
              input-id="auth-signin-password"
            />
          </div>

          <InlineNote v-if="networkError" class="auth-card__notice" tone="err" role="alert">
            Couldn't reach Calvin. Check the connection and try again.
          </InlineNote>

          <Button
            v-if="!oskCollapsed"
            type="submit"
            variant="primary"
            class="auth-card__submit"
            :disabled="submitting || rateLocked"
            :loading="submitting"
          >
            {{ submitLabel }}
          </Button>

          <div v-if="mode === 'setup' && !hideRecovery" class="auth-card__recover">
            If you forget it, delete <code>admin-auth.json</code> from Calvin's data folder, or set
            <code>CALVIN_ADMIN_PASSWORD</code>, then restart Calvin.
          </div>

          <details
            v-if="mode === 'locked' && !hideRecovery"
            class="auth-card__recover auth-card__forgot"
          >
            <summary>Forgot the password?</summary>
            <p>
              Someone with access to the server deletes <code>admin-auth.json</code> from Calvin's
              data folder and restarts Calvin. Settings then asks for a new password. Or set
              <code>CALVIN_ADMIN_PASSWORD</code> and restart. That password always wins.
            </p>
          </details>
        </Card>
      </form>

      <template v-if="showPhone && !oskVisible">
        <div class="auth-lock__seam" aria-hidden="true"><span>or</span></div>
        <PhoneSetupCard
          class="auth-lock__phone"
          :compact="isShort"
          :setup-code="mode === 'setup' ? shownSetupCode : ''"
          :title="mode === 'setup' ? 'Set it up from your phone' : 'Sign in from your phone'"
          :hint="isShort ? '' : undefined"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useAuthStore, authErrorCode, retryAfterSeconds } from "@/stores/auth";
import { useRateLimitCountdown } from "@/composables/useRateLimitCountdown";
import { useTouchCapability } from "@/composables/useTouchCapability";
import { useOskState } from "@/composables/useOnScreenKeyboard";
import { useNotificationsStore } from "@/stores/notifications";
import { isLoopbackPage } from "@/utils/serverUrl";
import PasswordField from "@/components/ui/PasswordField.vue";
import PhoneSetupCard from "@/components/ui/PhoneSetupCard.vue";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import InlineNote from "@/components/ui/InlineNote.vue";

const auth = useAuthStore();
const notifications = useNotificationsStore();
const { isTouch } = useTouchCapability();
const osk = useOskState();

const mode = computed(() => (auth.status === "setup" ? "setup" : "locked"));
const title = computed(() =>
  mode.value === "setup" ? "Choose an admin password" : "Sign in to Settings"
);
const lead = computed(() =>
  mode.value === "setup"
    ? "Anyone on your network who knows it can change Calvin. The dashboard stays open to everyone."
    : "Enter the admin password for this Calvin."
);

const password = ref("");
const repeat = ref("");
const setupCode = ref("");
const revealed = ref(false);
const error1 = ref("");
const error2 = ref("");
const error3 = ref("");
const notice = ref("");
const networkError = ref(false);
const submitting = ref(false);
const retrying = ref(false);
const shownSetupCode = ref("");
const prefilledFromLink = ref(false);

const codePrefilled = computed(() => Boolean(shownSetupCode.value || prefilledFromLink.value));
const codePrefillHint = computed(() =>
  prefilledFromLink.value ? "Filled in from the Calvin screen." : "Filled in from this screen."
);

const submitLabel = computed(() => {
  if (mode.value === "setup") return submitting.value ? "Setting password…" : "Set password";
  return submitting.value ? "Signing in…" : "Sign in";
});

const codeField = ref(null);
const firstField = ref(null);
const secondField = ref(null);

const {
  locked: rateLocked,
  remaining: rateRemaining,
  start: startCountdown,
} = useRateLimitCountdown();
const liveMessage = ref("");
const rateMessage = computed(() =>
  mode.value === "setup"
    ? `Too many wrong tries. Try again in ${rateRemaining.value}.`
    : `Too many wrong passwords. Try again in ${rateRemaining.value}.`
);

watch(rateLocked, lockedNow => {
  if (lockedNow) {
    liveMessage.value =
      mode.value === "setup" ? "Too many wrong tries." : "Too many wrong passwords.";
  } else if (liveMessage.value) {
    liveMessage.value = "You can try again now.";
    nextTick(() => focusField());
  }
});

// ── Viewport ─────────────────────────────────────────────────────────────────
const width = ref(typeof window === "undefined" ? 1024 : window.innerWidth);
const height = ref(typeof window === "undefined" ? 768 : window.innerHeight);
const onResize = () => {
  width.value = window.innerWidth;
  height.value = window.innerHeight;
};
onMounted(() => window.addEventListener("resize", onResize));
onUnmounted(() => window.removeEventListener("resize", onResize));

const isPhone = computed(() => width.value < 480);
const isShort = computed(() => height.value < 600);
const showPhone = computed(() => isTouch.value && width.value >= 720);
const oskVisible = computed(() => osk.visible.value);
const oskCollapsed = computed(() => oskVisible.value && height.value - 64 - osk.height.value < 320);
const showIcon = computed(() => !isPhone.value && !isShort.value && !oskCollapsed.value);
const hideRecovery = computed(() => isShort.value || oskCollapsed.value);

// ── S0: blank for 300ms, then "Checking…" ────────────────────────────────────
const checkingReady = ref(false);
let checkingTimer = null;
onMounted(() => {
  if (auth.status !== "checking") return;
  checkingTimer = setTimeout(() => {
    checkingTimer = null;
    checkingReady.value = true;
  }, 300);
});
onUnmounted(() => {
  if (checkingTimer !== null) clearTimeout(checkingTimer);
});

// ── Focus: autofocus only on non-touch (a kiosk keyboard would pop unasked) ──
function focusField() {
  nextTick(() => {
    if (mode.value === "setup") codeField.value?.focus();
    else firstField.value?.focus();
  });
}

/** The kiosk screen may show the code itself when the server allows it (loopback). */
async function loadSetupCode() {
  if (!isLoopbackPage()) return;
  const code = await auth.fetchSetupCode();
  shownSetupCode.value = code || "";
  if (code && !prefilledFromLink.value) setupCode.value = code;
}

/**
 * A phone that scanned the server screen's QR arrives with `?setup=CODE`.
 * Apply it once (still editable) and drop it from the address bar so it is
 * not kept in history or shared by copy-paste.
 */
const SETUP_PARAM = "setup";
let linkParamApplied = false;

function readSetupParam() {
  if (typeof window === "undefined") return "";
  const raw = new URLSearchParams(window.location.search).get(SETUP_PARAM) || "";
  const normalized = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(normalized)) return "";
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

function stripSetupParam() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SETUP_PARAM)) return;
  url.searchParams.delete(SETUP_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function applySetupParam() {
  if (linkParamApplied) return;
  linkParamApplied = true;
  const fromLink = readSetupParam();
  if (!fromLink) return;
  setupCode.value = fromLink;
  prefilledFromLink.value = true;
  stripSetupParam();
}

watch(
  () => auth.status,
  value => {
    if (value === "setup") {
      applySetupParam();
      loadSetupCode();
    }
    if (!isTouch.value && (value === "setup" || value === "locked")) focusField();
  }
);
onMounted(() => {
  if (auth.status === "setup") {
    applySetupParam();
    loadSetupCode();
  }
  if (!isTouch.value && (auth.status === "setup" || auth.status === "locked")) focusField();
});

watch(password, () => {
  error1.value = "";
});
watch(repeat, () => {
  error2.value = "";
});
watch(setupCode, () => {
  error3.value = "";
});

function onFirstBlur() {
  if (mode.value !== "setup" || !password.value) return;
  if ([...password.value].length < 8) error1.value = "Use at least 8 characters.";
}

function onSecondBlur() {
  if (mode.value !== "setup" || !repeat.value) return;
  if (password.value !== repeat.value) error2.value = "The passwords don't match.";
}

function validateSetup() {
  if (!setupCode.value.trim()) {
    error3.value = "Enter the setup code.";
    nextTick(() => codeField.value?.focus());
    return false;
  }
  if ([...password.value].length < 8) {
    error1.value = "Use at least 8 characters.";
    nextTick(() => firstField.value?.focus());
    return false;
  }
  if (password.value !== repeat.value) {
    error2.value = "The passwords don't match.";
    nextTick(() => secondField.value?.focus());
    return false;
  }
  return true;
}

function resetSetupFields() {
  password.value = "";
  repeat.value = "";
  setupCode.value = "";
  error1.value = "";
  error2.value = "";
  error3.value = "";
  revealed.value = false;
}

async function retry() {
  retrying.value = true;
  await auth.fetchStatus();
  retrying.value = false;
}

async function submit() {
  if (submitting.value || rateLocked.value) return;
  notice.value = "";
  networkError.value = false;
  submitBannerClear();

  if (mode.value === "setup") await submitSetup();
  else await submitLogin();
}

function submitBannerClear() {
  error1.value = "";
  error2.value = "";
  error3.value = "";
}

async function submitSetup() {
  if (!validateSetup()) return;

  submitting.value = true;
  try {
    await auth.setup(password.value, setupCode.value.trim());
    resetSetupFields();
    notifications.notify({ severity: "success", message: "Admin password set." });
  } catch (err) {
    const code = authErrorCode(err);
    if (err?.response?.status === 429 || code === "rate_limited") {
      startCountdown(retryAfterSeconds(err));
    } else if (code === "already_configured") {
      notice.value =
        "Someone else set the admin password a moment ago. Sign in with it, or ask them for it.";
      resetSetupFields();
      focusField();
    } else if (code === "bad_setup_code") {
      error3.value = "That's not the setup code.";
      nextTick(() => codeField.value?.focus());
    } else if (err?.response?.status === 422 || err?.response?.status === 400) {
      const detail = err.response?.data?.detail;
      error1.value =
        (typeof detail === "string" ? detail : detail?.message) || "Use at least 8 characters.";
      nextTick(() => firstField.value?.focus());
    } else if (!err?.response) {
      networkError.value = true;
    } else {
      networkError.value = true;
    }
  } finally {
    submitting.value = false;
  }
}

async function submitLogin() {
  if (!password.value) {
    error1.value = "Enter the admin password.";
    nextTick(() => firstField.value?.focus());
    return;
  }

  submitting.value = true;
  try {
    await auth.login(password.value);
  } catch (err) {
    const code = authErrorCode(err);
    if (err?.response?.status === 429 || code === "rate_limited") {
      startCountdown(retryAfterSeconds(err));
    } else if (code === "setup_required") {
      notice.value = "Calvin's admin password was reset. Choose a new one.";
      resetSetupFields();
    } else if (err?.response?.status === 401) {
      error1.value = "That's not the admin password.";
      nextTick(() => {
        firstField.value?.focus();
        firstField.value?.select();
      });
    } else if (!err?.response) {
      networkError.value = true;
    } else {
      networkError.value = true;
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.auth-lock {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--gap-5);
  overflow: auto;
  background: var(--bg-0);
}
/* On-screen keyboard up: reserve its height so the centred card sits above it.
   Two classes so the later --short and phone padding rules can't reset it
   (CLV-114: a 600px panel in a browser window is "short" and lost the room).
   --osk-height is in screen pixels, but the lock screen is zoomed by the
   Settings UI size, hence the division by --ui-scale.
   ASSUMPTION: this component is only ever rendered inside Settings.vue's
   `.settings-lock-scale { zoom: var(--ui-scale) }` wrapper (its only user
   today). Rendered anywhere without that zoom, the division under-reserves
   at sizes above 1 and over-reserves below; move the compensation to the
   wrapper then. */
.auth-lock.auth-lock--osk-up {
  padding-bottom: calc(var(--gap-5) + var(--osk-height, 0px) / var(--ui-scale, 1));
}
.auth-lock.auth-lock--short.auth-lock--osk-up {
  padding-bottom: calc(var(--gap-3) + var(--osk-height, 0px) / var(--ui-scale, 1));
}
.auth-lock__checking {
  margin: auto;
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--ink-2);
}
.auth-lock__checking.is-hidden {
  visibility: hidden;
}
.auth-lock__row {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

/* Card owns the surface; this is only the lock screen's width. */
.auth-card {
  width: 26rem;
  max-width: 100%;
  text-align: left;
}
.auth-card__icon {
  width: 44px;
  height: 44px;
  margin-bottom: var(--gap-4);
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--focus) 14%, transparent);
  color: var(--focus-text);
}
.auth-card__title {
  margin: 0 0 var(--gap-1);
  line-height: 1.3;
}
.auth-card__lead {
  margin: 0 0 var(--gap-4);
  font-size: var(--text-body);
  line-height: 1.45;
  color: var(--ink-2);
}
.auth-card__notice {
  margin-bottom: var(--gap-3);
}
.auth-card__hint-link {
  margin-left: var(--gap-1);
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.auth-card__hint-link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
/* Kept for password managers: one consistent account across the forms. */
.auth-card__username {
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
.auth-card__fields {
  display: flex;
  flex-direction: column;
  gap: var(--gap-3);
  margin-bottom: var(--gap-3);
}
.auth-card__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.auth-card__recover {
  margin-top: var(--gap-3);
  padding-top: var(--gap-3);
  border-top: 1px solid var(--line-soft);
  font-size: var(--text-meta);
  line-height: 1.5;
  color: var(--ink-2);
}
.auth-card__forgot summary {
  display: flex;
  align-items: center;
  min-height: var(--touch-target);
  margin: calc(var(--gap-3) * -1) 0 calc(var(--gap-2) * -1);
  font-weight: var(--weight-strong);
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  list-style: none;
}
.auth-card__forgot summary::-webkit-details-marker {
  display: none;
}
.auth-card__forgot p {
  margin: var(--gap-2) 0 0;
}
.auth-card code {
  padding: 1px 5px;
  font-family: var(--font-data);
  font-size: 0.85em;
  color: var(--ink);
  background: var(--bg-0);
  border-radius: var(--radius-control);
}

.auth-card__submit {
  width: 100%;
  margin-top: var(--gap-1);
}

/* "or" seam between the password card and the phone hand-off (kiosk only). */
.auth-lock__seam {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--gap-2);
  margin: var(--gap-6) var(--gap-4);
  font-size: var(--text-body);
  color: var(--ink-3);
}
.auth-lock__seam::before,
.auth-lock__seam::after {
  content: "";
  flex: 1;
  width: 1px;
  background: var(--line);
}
.auth-lock__phone {
  width: 30rem;
}

/* Short kiosk (800x480): no icon, compact stacked phone card, no hint. */
.auth-lock--short {
  padding: var(--gap-3);
}
.auth-lock--short .auth-card {
  width: 22rem;
}
.auth-lock--short .auth-card__lead {
  margin-bottom: var(--gap-2);
}
.auth-lock--short .auth-card__fields {
  gap: var(--gap-2);
}
.auth-lock--short .auth-lock__seam {
  margin: var(--gap-3) var(--gap-2);
}
.auth-lock--short .auth-lock__phone {
  width: 17rem;
  flex-direction: column;
  align-items: flex-start;
}

/* On-screen keyboard up: only the field (plus any banner) is left. */
.auth-lock--osk-collapsed .auth-card__fields {
  margin-bottom: 0;
}

/* Phone width: full-width card, top-aligned, no icon or phone hand-off. */
@media (max-width: 480px) {
  .auth-lock,
  .auth-lock--short {
    align-items: flex-start;
    padding: var(--gap-5) var(--gap-4);
  }
  .auth-lock__row {
    display: block;
  }
  .auth-card,
  .auth-lock--short .auth-card {
    width: 100%;
  }
  .auth-card__lead {
    margin-bottom: var(--gap-4);
  }
}
</style>
