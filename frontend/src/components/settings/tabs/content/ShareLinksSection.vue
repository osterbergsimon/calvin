<template>
  <div data-test="share-links">
    <SettingRow
      label="Share links"
      description="Let family and friends add photos from their phone. Each link only adds photos to its own folder in Local photos."
    >
      <Button
        v-if="!formOpen"
        data-test="share-links-create"
        :variant="store.links.length ? 'secondary' : 'primary'"
        @click="openForm"
      >
        Create link
      </Button>
    </SettingRow>
    <InlineNote v-if="liveMessage" aria-live="polite">{{ liveMessage }}</InlineNote>

    <SettingRow v-if="formOpen" label="Create a share link" stacked>
      <form data-test="share-link-form" novalidate @submit.prevent="submit">
        <TextField
          v-model="name"
          label="Name"
          input-id="share-link-name"
          maxlength="40"
          placeholder="Grandma"
          hint="Who the link is for, so you know which one to revoke."
          :error="nameError"
        />
        <TextField
          v-model="folder"
          label="Folder in Local photos"
          input-id="share-link-folder"
          maxlength="40"
          :hint="folderHint"
          :error="folderError"
        />
        <SettingRow label="Link works for" flush>
          <SelectPill
            v-model="expiresInDays"
            :options="expiryOptions"
            aria-label="Link works for"
          />
        </SettingRow>
        <Button
          type="submit"
          variant="primary"
          data-test="share-link-submit"
          :loading="creating"
          loading-label="Creating…"
        >
          Create link
        </Button>
        <Button data-test="share-link-cancel" :disabled="creating" @click="closeForm">
          Cancel
        </Button>
        <InlineNote v-if="createError" tone="err" role="alert">{{ createError }}</InlineNote>
      </form>
    </SettingRow>

    <SettingRow
      v-if="store.loadFailed && !store.links.length"
      label="Share links"
      description="Couldn't load share links."
    >
      <Button data-test="share-links-retry" @click="load">Try again</Button>
    </SettingRow>

    <InlineNote
      v-else-if="!store.loading && !store.links.length && !formOpen"
      data-test="share-links-empty"
    >
      No share links yet.
    </InlineNote>

    <SettingRow v-if="store.links.length" label="Your links" stacked>
      <ListRow
        v-for="item in store.links"
        :key="item.id"
        :name="item.name"
        :meta="[linkMeta(item)]"
        data-test="share-link-row"
      >
        <form
          v-if="renamingId === item.id"
          data-test="share-link-rename-form"
          novalidate
          @submit.prevent="saveRename(item)"
        >
          <TextField
            v-model="renameValue"
            label="New name"
            :input-id="`share-link-rename-${item.id}`"
            maxlength="40"
            :error="renameError"
          />
          <Button type="submit" size="sm" variant="primary">Save</Button>
          <Button size="sm" @click="renamingId = null">Cancel</Button>
        </form>

        <div v-if="shownId === item.id" data-test="share-link-qr">
          <PhoneSetupCard
            :url="urlFor(item)"
            title="Scan to add photos"
            hint="Open it on the phone, then tap Add photos. On Android, install it to share photos straight from the gallery."
            compact
          />
          <Button size="sm" data-test="share-link-copy" @click="copyUrl(item)">
            {{ copiedId === item.id ? "Copied" : "Copy link" }}
          </Button>
        </div>

        <InlineNote v-if="rowErrors[item.id]" tone="err" data-test="share-link-row-error">
          {{ rowErrors[item.id] }}
        </InlineNote>

        <template #actions>
          <Tag v-if="item.expired" tone="warn" data-test="share-link-expired">Expired</Tag>
          <Button
            size="sm"
            data-test="share-link-show"
            :aria-expanded="shownId === item.id ? 'true' : 'false'"
            @click="toggleQr(item)"
          >
            {{ shownId === item.id ? "Hide QR" : "Show QR" }}
          </Button>
          <Button size="sm" data-test="share-link-rename" @click="startRename(item)">
            Rename
          </Button>
          <Button variant="danger" size="sm" data-test="share-link-revoke" @click="askRevoke(item)">
            Revoke
          </Button>
        </template>
      </ListRow>
    </SettingRow>

    <Dialog
      :model-value="Boolean(revoking)"
      :title="`Revoke &quot;${revoking?.name}&quot;?`"
      size="sm"
      @update:model-value="open => !open && (revoking = null)"
    >
      <p>
        The link stops working right away. Photos already sent stay in Local photos unless you
        remove them.
      </p>
      <label v-if="revoking?.uploadCount">
        <input v-model="removePhotos" type="checkbox" data-test="share-link-remove-photos" />
        Also remove the {{ photoCount(revoking.uploadCount) }} sent with this link
      </label>
      <template #actions>
        <Button variant="secondary" @click="revoking = null">Cancel</Button>
        <Button variant="danger" data-test="share-link-revoke-confirm" @click="revoke">
          Revoke link
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useShareLinksStore } from "@/stores/shareLinks";
import { shareUrl } from "@/services/shareApi";
import { resolveServerUrl } from "@/utils/serverUrl";
import { formatKeyDate, formatLastUsed } from "@/utils/apiKeyFormat";
import { logError } from "@/utils/logger";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ListRow from "@/components/ui/ListRow.vue";
import PhoneSetupCard from "@/components/ui/PhoneSetupCard.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import Tag from "@/components/ui/Tag.vue";
import TextField from "@/components/ui/TextField.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";

// Settings › Content › Photos: share links for guest photo upload (calvin-mwqo).
// The URL (and so the QR code) can be shown again at any time; revoking is
// immediate and can also remove the photos guests sent with the link.

const DEFAULT_FOLDER = "Guests";
const expiryOptions = [
  { value: 0, label: "Until revoked" },
  { value: 1, label: "1 day" },
  { value: 7, label: "1 week" },
  { value: 30, label: "30 days" },
];

const store = useShareLinksStore();
const serverUrl = ref("");

const formOpen = ref(false);
const name = ref("");
const folder = ref(DEFAULT_FOLDER);
const expiresInDays = ref(0);
const nameError = ref("");
const folderError = ref("");
const createError = ref("");
const creating = ref(false);

const shownId = ref(null);
const copiedId = ref(null);
const renamingId = ref(null);
const renameValue = ref("");
const renameError = ref("");
const revoking = ref(null);
const removePhotos = ref(false);
const rowErrors = ref({});
const liveMessage = ref("");

const folderHint = computed(() => {
  const existing = store.folders;
  return existing.length
    ? `Photos land here. Existing folders: ${existing.join(", ")}.`
    : "Photos land here. Calvin creates the folder.";
});

watch(name, () => (nameError.value = ""));
watch(folder, () => (folderError.value = ""));

const photoCount = count => `${count} photo${count === 1 ? "" : "s"}`;

const linkMeta = item => {
  const now = new Date();
  const created = formatKeyDate(item.createdAt, now);
  return [
    `Folder ${item.folder}`,
    created ? `Created ${created}` : "",
    item.lastUsedAt ? `Last used ${formatLastUsed(item.lastUsedAt, now)}` : "Never used",
    photoCount(item.uploadCount || 0),
    item.expiresAt && !item.expired ? `Ends ${formatKeyDate(item.expiresAt, now)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
};

const urlFor = item => shareUrl(serverUrl.value || window.location.origin, item.path);

async function load() {
  try {
    await store.fetchLinks();
  } catch (err) {
    logError("[ShareLinksSection]", "load failed", err?.response?.status);
  }
}

onMounted(async () => {
  load();
  store.fetchFolders();
  serverUrl.value = await resolveServerUrl();
});

function openForm() {
  formOpen.value = true;
  createError.value = "";
}

function closeForm() {
  formOpen.value = false;
  name.value = "";
  folder.value = DEFAULT_FOLDER;
  expiresInDays.value = 0;
  createError.value = "";
}

async function submit() {
  if (creating.value) return;
  const trimmed = name.value.trim();
  if (!trimmed) {
    nameError.value = "Give the link a name.";
    return;
  }
  const folderName = folder.value.trim();
  if (!folderName) {
    folderError.value = "Choose a folder.";
    return;
  }
  creating.value = true;
  createError.value = "";
  try {
    const link = await store.createLink({
      name: trimmed,
      folder: folderName,
      expiresInDays: expiresInDays.value || null,
    });
    closeForm();
    shownId.value = link.id;
    liveMessage.value = `${link.name} created. Scan the QR code on the guest's phone.`;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 409) nameError.value = `You already have a link called ${trimmed}.`;
    else if (status === 422) folderError.value = "Use letters, numbers, spaces, - or _.";
    else if (status !== 401) {
      createError.value = "Couldn't create the link. Try again.";
      logError("[ShareLinksSection]", "create failed", status);
    }
  } finally {
    creating.value = false;
  }
}

function toggleQr(item) {
  shownId.value = shownId.value === item.id ? null : item.id;
}

async function copyUrl(item) {
  try {
    await navigator.clipboard.writeText(urlFor(item));
    copiedId.value = item.id;
    liveMessage.value = "Link copied.";
  } catch {
    rowErrors.value = { ...rowErrors.value, [item.id]: "Couldn't copy. Long-press the address." };
  }
}

function startRename(item) {
  renamingId.value = item.id;
  renameValue.value = item.name;
  renameError.value = "";
}

async function saveRename(item) {
  const trimmed = renameValue.value.trim();
  if (!trimmed) {
    renameError.value = "Give the link a name.";
    return;
  }
  try {
    await store.renameLink(item.id, trimmed);
    renamingId.value = null;
    liveMessage.value = `Renamed to ${trimmed}.`;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 409) renameError.value = `You already have a link called ${trimmed}.`;
    else if (status !== 401) renameError.value = "Couldn't rename the link. Try again.";
  }
}

function askRevoke(item) {
  rowErrors.value = { ...rowErrors.value, [item.id]: "" };
  removePhotos.value = false;
  revoking.value = item;
}

async function revoke() {
  const item = revoking.value;
  revoking.value = null;
  if (!item) return;
  try {
    await store.revokeLink(item.id, { removePhotos: removePhotos.value });
    if (shownId.value === item.id) shownId.value = null;
    liveMessage.value = `${item.name} revoked.`;
  } catch (err) {
    if (err?.response?.status !== 401) {
      rowErrors.value = { ...rowErrors.value, [item.id]: "Couldn't revoke this link. Try again." };
      logError("[ShareLinksSection]", "revoke failed", err?.response?.status);
    }
  }
}
</script>
