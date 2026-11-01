<template>
  <SettingGroup title="Share links" data-test="share-links">
    <SettingRow label="Guest photos">
      <template #description>
        <InlineNote
          >Let guests add photos to one folder in Local photos from their phone.</InlineNote
        >
        <InlineNote aria-live="polite" data-test="share-links-live">{{ liveMessage }}</InlineNote>
      </template>
      <Button
        v-if="!formOpen"
        data-test="share-links-create"
        :variant="store.links.length ? 'secondary' : 'primary'"
        @click="openForm"
      >
        Create link
      </Button>
    </SettingRow>

    <SettingRow v-if="formOpen" label="New share link" stacked>
      <form data-test="share-link-form" novalidate @submit.prevent="submit">
        <TextField
          v-model="name"
          label="Name"
          input-id="share-link-name"
          placeholder="Grandma"
          hint="Who the link is for, so you know which one to revoke."
          :error="nameError"
        />
        <TextField
          v-model="folder"
          label="Folder in Local photos"
          input-id="share-link-folder"
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
        <SettingRow
          label="Photo limit"
          description="The link stops taking photos after this many."
          flush
        >
          <SelectPill v-model="maxPhotos" :options="photoLimitOptions" aria-label="Photo limit" />
        </SettingRow>
        <Button
          type="submit"
          variant="primary"
          data-test="share-link-submit"
          :loading="creating"
          loading-label="Creating…"
        >
          Create
        </Button>
        <Button data-test="share-link-cancel" :disabled="creating" @click="closeForm">
          Cancel
        </Button>
        <InlineNote v-if="createError" tone="err" role="alert">{{ createError }}</InlineNote>
      </form>
    </SettingRow>

    <SettingRow
      v-if="store.loadFailed && !store.links.length"
      label="Your links"
      description="Couldn't load share links."
    >
      <Button data-test="share-links-retry" @click="load">Try again</Button>
    </SettingRow>

    <EmptyState
      v-else-if="!store.loading && !store.links.length && !formOpen"
      compact
      :icon="mdiLinkVariant"
      title="No share links yet."
      :phone-hint="false"
      data-test="share-links-empty"
    />

    <SettingGroup v-if="store.links.length" title="Your links" list>
      <template v-for="item in store.links" :key="item.id">
        <ListRow :name="item.name" :meta="linkMeta(item)" data-test="share-link-row">
          <template #actions>
            <Tag v-if="item.expired" tone="warn" data-test="share-link-expired">Expired</Tag>
            <Button
              size="sm"
              data-test="share-link-show"
              :aria-label="`${shownId === item.id ? 'Hide' : 'Show'} QR code for ${item.name}`"
              :aria-expanded="shownId === item.id ? 'true' : 'false'"
              @click="toggleQr(item)"
            >
              {{ shownId === item.id ? "Hide QR" : "Show QR" }}
            </Button>
            <Button
              size="sm"
              data-test="share-link-rename"
              :aria-label="`Rename ${item.name}`"
              @click="startRename(item)"
            >
              Rename
            </Button>
            <Button
              variant="danger"
              size="sm"
              data-test="share-link-revoke"
              :aria-label="`Revoke ${item.name}`"
              @click="askRevoke(item)"
            >
              Revoke
            </Button>
          </template>
        </ListRow>

        <form
          v-if="renamingId === item.id"
          data-test="share-link-rename-form"
          novalidate
          @submit.prevent="saveRename(item)"
        >
          <TextField
            v-model="renameValue"
            :label="`New name for ${item.name}`"
            :input-id="`share-link-rename-${item.id}`"
            :error="renameError"
          />
          <Button type="submit" size="sm" variant="primary">Save</Button>
          <Button size="sm" @click="renamingId = null">Cancel</Button>
        </form>

        <Card v-if="shownId === item.id" data-test="share-link-qr">
          <PhoneSetupCard
            :url="urlFor(item)"
            title="Scan to add photos"
            hint="Open it on the phone, then tap Add photos. On Android, install it to share photos straight from the gallery."
            compact
          />
          <Button size="sm" data-test="share-link-copy" @click="copyUrl(item)">
            {{ copiedId === item.id ? "Copied" : "Copy link" }}
          </Button>
        </Card>

        <InlineNote v-if="rowErrors[item.id]" tone="err" data-test="share-link-row-error">
          {{ rowErrors[item.id] }}
        </InlineNote>
      </template>
    </SettingGroup>

    <ConfirmModal
      :show="Boolean(revoking)"
      :title="`Revoke ${revoking?.name ?? 'link'}?`"
      message="The link stops working right away. Photos already sent stay in Local photos unless you remove them."
      confirm-text="Revoke link"
      :danger="true"
      @confirm="revoke"
      @cancel="revoking = null"
    >
      <SettingRow
        v-if="revoking?.uploadCount"
        :label="`Also remove the ${photoCount(revoking.uploadCount)} sent with this link`"
        flush
      >
        <ToggleSwitch
          v-model="removePhotos"
          :aria-label="`Also remove the ${photoCount(revoking.uploadCount)} sent with this link`"
          data-test="share-link-remove-photos"
        />
      </SettingRow>
    </ConfirmModal>
  </SettingGroup>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { mdiLinkVariant } from "@mdi/js";
import { useShareLinksStore } from "@/stores/shareLinks";
import { shareUrl } from "@/services/shareApi";
import { resolveServerUrl } from "@/utils/serverUrl";
import { formatKeyDate, formatLastUsed } from "@/utils/apiKeyFormat";
import { logError } from "@/utils/logger";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ListRow from "@/components/ui/ListRow.vue";
import PhoneSetupCard from "@/components/ui/PhoneSetupCard.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import SettingGroup from "@/components/ui/SettingGroup.vue";
import Tag from "@/components/ui/Tag.vue";
import TextField from "@/components/ui/TextField.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
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
// The server's default per-link quota is 500 photos.
const DEFAULT_PHOTO_LIMIT = 500;
const photoLimitOptions = [
  { value: 100, label: "100 photos" },
  { value: 500, label: "500 photos" },
  { value: 2000, label: "2,000 photos" },
];

const store = useShareLinksStore();
const serverUrl = ref("");

const formOpen = ref(false);
const name = ref("");
const folder = ref(DEFAULT_FOLDER);
const expiresInDays = ref(0);
const maxPhotos = ref(DEFAULT_PHOTO_LIMIT);
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

/** Which field a 422 is about: the server checks the length limits, not this form. */
const invalidField = err => {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) return detail[0]?.loc?.at(-1) || "";
  return detail?.code === "invalid_folder" ? "folder" : "";
};

const linkMeta = item => {
  const now = new Date();
  const created = formatKeyDate(item.createdAt, now);
  return [
    [`Folder ${item.folder}`, created ? `Created ${created}` : ""].filter(Boolean).join(" · "),
    [
      item.lastUsedAt ? `Last used ${formatLastUsed(item.lastUsedAt, now)}` : "Never used",
      photoCount(item.uploadCount || 0),
      item.expiresAt && !item.expired ? `Ends ${formatKeyDate(item.expiresAt, now)}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  ];
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
  maxPhotos.value = DEFAULT_PHOTO_LIMIT;
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
      maxPhotos: maxPhotos.value,
    });
    closeForm();
    shownId.value = link.id;
    liveMessage.value = `${link.name} created. Scan the QR code on the guest's phone.`;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 409) nameError.value = `You already have a link called ${trimmed}.`;
    else if (status === 422 && invalidField(err) === "name")
      nameError.value = "Use a shorter name.";
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
