<template>
  <main class="guest" data-test="guest-share">
    <header class="guest__header">
      <img class="guest__logo" src="/favicon.svg" alt="" width="40" height="40" />
      <h1 class="guest__title">{{ title }}</h1>
    </header>

    <InlineNote v-if="state === 'loading'" role="status">Opening…</InlineNote>

    <!-- Revoked and expired both land here: the server doesn't say which. -->
    <EmptyState
      v-else-if="state === 'invalid'"
      compact
      :icon="mdiLinkOff"
      title="This link doesn't work any more"
      help="Ask the person who sent it for a new one."
      :phone-hint="false"
      data-test="guest-invalid"
    />

    <EmptyState
      v-else-if="state === 'error'"
      compact
      :icon="mdiWifiOff"
      title="Calvin can't be reached"
      help="Check that this phone is on the same Wi-Fi, then try again."
      action-label="Try again"
      :phone-hint="false"
      data-test="guest-error"
      @action="load"
    />

    <template v-else>
      <section class="guest__actions" aria-label="Add photos">
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          hidden
          data-test="guest-file-input"
          @change="onPicked"
        />
        <Button
          variant="primary"
          class="guest__add"
          data-test="guest-add"
          :icon="mdiImagePlus"
          :disabled="!available || busy"
          @click="fileInput?.click()"
        >
          Add photos
        </Button>
        <InlineNote v-if="!available" tone="warn">
          Calvin can't take photos right now. Ask the owner to turn on Local photos.
        </InlineNote>

        <div v-if="busy" class="guest__progress" data-test="guest-progress">
          <InlineNote>{{ progressText }}</InlineNote>
          <ProgressBar
            :value="percent"
            label="Upload progress"
            :value-text="progressText"
            data-test="guest-progress-bar"
          />
        </div>

        <!-- The one live region: the outcome, once, after the upload. -->
        <div role="status" class="guest__live">
          <InlineNote v-if="status" tone="ok" data-test="guest-status">{{ status }}</InlineNote>
        </div>
        <InlineNote
          v-for="(line, index) in errors"
          :key="index"
          tone="err"
          data-test="guest-errors"
        >
          {{ line }}
        </InlineNote>

        <Button v-if="installPrompt" data-test="guest-install" @click="install">
          Install on this phone
        </Button>
        <InlineNote v-if="installPrompt">
          Then share photos straight from your gallery: Share › Calvin photos.
        </InlineNote>
        <InlineNote v-else-if="showIosTip" data-test="guest-ios-tip">
          Tip: tap Share › Add to Home Screen to keep this handy.
        </InlineNote>
        <!-- Firefox for Android can't install the page or join the Share menu. -->
        <InlineNote v-else-if="showFirefoxTip" data-test="guest-firefox-tip">
          To add Calvin to the Share menu, open this link in Chrome.
        </InlineNote>
      </section>

      <Card v-if="uploads.length" :title="recentTitle" data-test="guest-recent">
        <InlineNote>{{ recentNote }}</InlineNote>
        <ul class="guest__grid">
          <li
            v-for="(item, index) in uploads"
            :key="item.imageId"
            class="guest__thumb"
            data-test="guest-thumb"
          >
            <!-- Decorative: the Remove button names the photo. -->
            <img :src="item.thumbnail" alt="" loading="lazy" />
            <IconButton
              class="guest__remove"
              :label="`Remove photo ${index + 1} of ${uploads.length}`"
              :icon="mdiTrashCanOutline"
              variant="danger"
              size="md"
              data-test="guest-remove"
              @click="removing = item"
            />
          </li>
        </ul>
      </Card>
    </template>

    <ConfirmModal
      :show="Boolean(removing)"
      title="Remove this photo?"
      message="It disappears from Calvin's photos."
      confirm-text="Remove"
      :danger="true"
      @confirm="remove"
      @cancel="removing = null"
    />
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { mdiImagePlus, mdiLinkOff, mdiTrashCanOutline, mdiWifiOff } from "@mdi/js";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import IconButton from "@/components/ui/IconButton.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ProgressBar from "@/components/ui/ProgressBar.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import {
  claimGuestUploads,
  getGuest,
  listGuestUploads,
  removeGuestUpload,
  uploadGuestPhoto,
} from "@/services/shareApi";
import { logError } from "@/utils/logger";

// The guest page of a share link (calvin-mwqo): phone-first, outside the
// dashboard and Settings shell. The token in the URL is the only credential
// and only lets this page add photos to one folder and remove its own (or,
// when the link shows guests all its photos, any photo added with the link).

const route = useRoute();
const router = useRouter();
const token = computed(() => String(route.params.token || ""));

const state = ref("loading"); // loading | ready | invalid | error
const linkName = ref("");
const available = ref(true);
const seeAll = ref(false);
// One-time claim id from a share that arrived without this phone's cookie.
let pendingClaim = "";
const uploads = ref([]);
const busy = ref(false);
const total = ref(0);
const done = ref(0);
const fraction = ref(0);
const status = ref("");
const errors = ref([]);
const removing = ref(null);
const fileInput = ref(null);
const installPrompt = ref(null);

const title = computed(() => (linkName.value ? `Add photos for ${linkName.value}` : "Add photos"));
const current = computed(() => Math.min(done.value + 1, total.value));
const progressText = computed(() => `Sending ${current.value} of ${total.value}`);
const percent = computed(() =>
  total.value ? Math.round(((done.value + fraction.value) / total.value) * 100) : 0
);
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent || "");
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
const showIosTip = computed(() => state.value === "ready" && isIos() && !isStandalone());
const isAndroidFirefox = () => /android/i.test(navigator.userAgent || "") && /firefox\//i.test(navigator.userAgent || "");
const showFirefoxTip = computed(() => state.value === "ready" && isAndroidFirefox());
const recentTitle = computed(() => (seeAll.value ? "Photos added with this link" : "Your photos"));
const recentNote = computed(() =>
  seeAll.value
    ? "Everyone with this link can see and remove these."
    : "Only you can see and remove these from this phone."
);

const photos = count => `${count} photo${count === 1 ? "" : "s"}`;
const messageOf = err =>
  err?.response?.data?.detail?.message ||
  (err?.response ? "Calvin couldn't take this photo." : "Couldn't reach Calvin.");

/** Install this link (not the dashboard): the manifest names the share target. */
function useLinkManifest() {
  const href = `/api/guest/${encodeURIComponent(token.value)}/manifest.webmanifest`;
  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}

/** The phone's own light/dark setting; the guest has no Calvin theme to pick. */
let colourQuery = null;
const applyColourScheme = () => {
  const dark = Boolean(colourQuery?.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("light", !dark);
};

function readShareResult() {
  const { added, failed, error, claim } = route.query;
  if (typeof claim === "string" && claim) pendingClaim = claim;
  if (error === "share_link_invalid" || error === "invalid") return "invalid";
  if (error === "too_large") errors.value = ["Too many photos at once. Share fewer at a time."];
  else if (error) errors.value = ["Those photos couldn't be added. Try Add photos instead."];
  const addedCount = Number(added) || 0;
  const failedCount = Number(failed) || 0;
  if (added !== undefined || failed !== undefined) {
    status.value = [
      addedCount ? `${photos(addedCount)} added.` : "",
      failedCount ? `${failedCount} couldn't be added.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (added !== undefined || failed !== undefined || error || claim !== undefined) {
    router.replace({ query: {} });
  }
  return null;
}

async function load() {
  state.value = "loading";
  try {
    const info = await getGuest(token.value);
    linkName.value = info?.name || "";
    available.value = info?.available !== false;
    seeAll.value = info?.seeAll === true;
    await claimShare();
    uploads.value = await listGuestUploads(token.value);
    state.value = "ready";
  } catch (err) {
    state.value = err?.response?.status === 404 ? "invalid" : "error";
    if (state.value === "error") logError("[GuestShare]", "load failed", err?.response?.status);
  }
}

/** Claim the share's photos for this phone; a failed claim must not block the page. */
async function claimShare() {
  const claim = pendingClaim;
  if (!claim) return;
  pendingClaim = "";
  try {
    await claimGuestUploads(token.value, claim);
  } catch (err) {
    logError("[GuestShare]", "claim failed", err?.response?.status);
  }
}

async function onPicked(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length || busy.value) return;
  busy.value = true;
  total.value = files.length;
  done.value = 0;
  status.value = "";
  errors.value = [];
  let added = 0;
  for (const file of files) {
    fraction.value = 0;
    try {
      const result = await uploadGuestPhoto(token.value, file, value => {
        fraction.value = value;
      });
      const fresh = result?.uploaded || [];
      added += fresh.length;
      uploads.value = [...fresh, ...uploads.value];
      for (const failure of result?.failed || []) {
        errors.value.push(`${failure.filename}: ${failure.message}`);
      }
    } catch (err) {
      if (err?.response?.status === 404) {
        state.value = "invalid";
        break;
      }
      errors.value.push(`${file.name}: ${messageOf(err)}`);
    }
    done.value += 1;
  }
  busy.value = false;
  if (added) status.value = `${photos(added)} added.`;
  else if (!errors.value.length) status.value = "";
}

async function remove() {
  const item = removing.value;
  removing.value = null;
  if (!item) return;
  try {
    await removeGuestUpload(token.value, item.imageId);
    uploads.value = uploads.value.filter(u => u.imageId !== item.imageId);
    status.value = "Photo removed.";
  } catch (err) {
    errors.value = [`Couldn't remove that photo: ${messageOf(err)}`];
  }
}

const onInstallPrompt = event => {
  event.preventDefault();
  installPrompt.value = event;
};

async function install() {
  const prompt = installPrompt.value;
  installPrompt.value = null;
  try {
    await prompt?.prompt();
  } catch (err) {
    logError("[GuestShare]", "install prompt failed", err);
  }
}

onMounted(async () => {
  useLinkManifest();
  colourQuery = window.matchMedia?.("(prefers-color-scheme: dark)") || null;
  applyColourScheme();
  colourQuery?.addEventListener?.("change", applyColourScheme);
  window.addEventListener("beforeinstallprompt", onInstallPrompt);
  if (readShareResult() === "invalid") {
    state.value = "invalid";
    return;
  }
  await load();
});

onUnmounted(() => {
  colourQuery?.removeEventListener?.("change", applyColourScheme);
  window.removeEventListener("beforeinstallprompt", onInstallPrompt);
});
</script>

<style scoped>
.guest {
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100dvh;
  max-width: var(--guest-max-w);
  margin: 0 auto;
  padding: var(--gap-group) var(--gap-group) var(--gap-section);
  display: flex;
  flex-direction: column;
  gap: var(--gap-group);
  color: var(--ink);
  background: var(--bg-0);
}
.guest__header {
  display: flex;
  align-items: center;
  gap: var(--gap-stack);
}
.guest__logo {
  flex: none;
}
.guest__title {
  margin: 0;
  font-size: var(--text-title);
  font-weight: var(--weight-title);
  overflow-wrap: anywhere;
}
.guest__actions,
.guest__progress {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}
/* One big target for a thumb: the whole point of the page. */
.guest__add {
  width: 100%;
  min-height: var(--guest-add-h);
  font-size: var(--text-title);
}
.guest__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--guest-thumb-min), 1fr));
  gap: var(--gap-inline);
  margin: 0;
  padding: 0;
  list-style: none;
}
.guest__thumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--bg-2);
  border-radius: var(--radius-control);
}
.guest__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.guest__remove {
  position: absolute;
  top: var(--gap-tight);
  right: var(--gap-tight);
}
</style>
