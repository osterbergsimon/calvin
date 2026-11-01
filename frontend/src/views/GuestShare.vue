<template>
  <main class="guest" data-test="guest-share">
    <header class="guest__header">
      <img class="guest__logo" src="/favicon.svg" alt="" width="40" height="40" />
      <h1 class="guest__title">{{ title }}</h1>
    </header>

    <p v-if="state === 'loading'" class="guest__note" aria-live="polite">Opening…</p>

    <section v-else-if="state === 'invalid'" class="guest__card" data-test="guest-invalid">
      <h2 class="guest__heading">This link doesn't work any more</h2>
      <p class="guest__note">
        It was turned off or it ran out. Ask the person who sent it for a new one.
      </p>
    </section>

    <section v-else-if="state === 'error'" class="guest__card" data-test="guest-error">
      <h2 class="guest__heading">Calvin can't be reached</h2>
      <p class="guest__note">Check that this phone is on the same Wi-Fi, then try again.</p>
      <Button @click="load">Try again</Button>
    </section>

    <template v-else>
      <section class="guest__actions">
        <input
          ref="fileInput"
          class="guest__file"
          type="file"
          accept="image/*"
          multiple
          tabindex="-1"
          aria-hidden="true"
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
        <p v-if="!available" class="guest__note">
          Calvin can't take photos right now. Ask the owner to turn on Local photos.
        </p>

        <div v-if="busy" class="guest__progress" data-test="guest-progress" aria-live="polite">
          <span>Sending {{ current }} of {{ total }}</span>
          <div
            class="guest__bar"
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="percent"
            data-test="guest-progress-bar"
          >
            <span class="guest__bar-fill" :style="{ width: `${percent}%` }" />
          </div>
        </div>

        <p v-if="status" class="guest__status" role="status" data-test="guest-status">
          {{ status }}
        </p>
        <ul v-if="errors.length" class="guest__errors" data-test="guest-errors">
          <li v-for="(line, index) in errors" :key="index">{{ line }}</li>
        </ul>

        <Button v-if="installPrompt" data-test="guest-install" @click="install">
          Install on this phone
        </Button>
        <p v-if="installPrompt" class="guest__note">
          Then share photos straight from your gallery: Share › Calvin photos.
        </p>
        <p v-else-if="showIosTip" class="guest__note" data-test="guest-ios-tip">
          Tip: tap Share › Add to Home Screen to keep this handy.
        </p>
      </section>

      <section v-if="uploads.length" class="guest__recent" aria-labelledby="guest-recent-title">
        <h2 id="guest-recent-title" class="guest__heading">Your photos</h2>
        <p class="guest__note">Only you can see and remove these from this phone.</p>
        <ul class="guest__grid">
          <li
            v-for="item in uploads"
            :key="item.imageId"
            class="guest__thumb"
            data-test="guest-thumb"
          >
            <img :src="item.thumbnail" alt="A photo you added" loading="lazy" />
            <IconButton
              class="guest__remove"
              label="Remove photo"
              variant="danger"
              size="md"
              data-test="guest-remove"
              @click="removing = item"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
                <path :d="mdiTrashCanOutline" fill="currentColor" />
              </svg>
            </IconButton>
          </li>
        </ul>
      </section>
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
import { mdiImagePlus, mdiTrashCanOutline } from "@mdi/js";
import Button from "@/components/ui/Button.vue";
import IconButton from "@/components/ui/IconButton.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import {
  getGuest,
  listGuestUploads,
  removeGuestUpload,
  uploadGuestPhoto,
} from "@/services/shareApi";
import { logError } from "@/utils/logger";

// The guest page of a share link (calvin-mwqo): phone-first, outside the
// dashboard and Settings shell. The token in the URL is the only credential
// and only lets this page add photos to one folder and remove its own.

const route = useRoute();
const router = useRouter();
const token = computed(() => String(route.params.token || ""));

const state = ref("loading"); // loading | ready | invalid | error
const linkName = ref("");
const available = ref(true);
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
const percent = computed(() =>
  total.value ? Math.round(((done.value + fraction.value) / total.value) * 100) : 0
);
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent || "");
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
const showIosTip = computed(() => state.value === "ready" && isIos() && !isStandalone());

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
  const { added, failed, error } = route.query;
  if (error === "share_link_invalid" || error === "invalid") return "invalid";
  if (error) errors.value = ["Those photos couldn't be added. Try Add photos instead."];
  const addedCount = Number(added) || 0;
  const failedCount = Number(failed) || 0;
  if (added !== undefined || failed !== undefined) {
    status.value = [
      addedCount ? `${photos(addedCount)} added. Thank you!` : "",
      failedCount ? `${failedCount} couldn't be added.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (added !== undefined || failed !== undefined || error) {
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
    uploads.value = await listGuestUploads(token.value);
    state.value = "ready";
  } catch (err) {
    state.value = err?.response?.status === 404 ? "invalid" : "error";
    if (state.value === "error") logError("[GuestShare]", "load failed", err?.response?.status);
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
  if (added) status.value = `${photos(added)} added. Thank you!`;
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
  max-width: 34rem;
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
.guest__heading {
  margin: 0;
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
}
.guest__note {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-meta);
}
.guest__card,
.guest__actions,
.guest__recent {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}
.guest__card {
  padding: var(--gap-group);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
}
.guest__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
/* One big target for a thumb: the whole point of the page. */
.guest__add {
  width: 100%;
  min-height: 4.5rem;
  font-size: var(--text-title);
}
.guest__progress {
  display: flex;
  flex-direction: column;
  gap: var(--gap-tight);
  font-size: var(--text-meta);
}
.guest__bar {
  height: 0.5rem;
  overflow: hidden;
  background: var(--bg-2);
  border-radius: var(--radius-round);
}
.guest__bar-fill {
  display: block;
  height: 100%;
  background: var(--focus);
}
.guest__status {
  margin: 0;
  font-size: var(--text-body);
}
.guest__errors {
  margin: 0;
  padding-left: var(--gap-group);
  color: var(--err);
  font-size: var(--text-meta);
}
.guest__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
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
