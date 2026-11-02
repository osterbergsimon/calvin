<template>
  <div class="local-photos" data-test="local-photos-browser">
    <header class="lp-head">
      <Button
        variant="ghost"
        size="sm"
        :icon="mdiChevronLeft"
        data-test="local-photos-back"
        @click="$emit('close')"
      >
        Back
      </Button>
      <div class="lp-heading">
        <h3 class="lp-title">Local photos</h3>
        <p class="lp-count">{{ countLabel }}</p>
      </div>
    </header>

    <div class="lp-toolbar">
      <div class="lp-filters">
        <SegmentedControl
          v-model="folderFilter"
          :options="filterOptions"
          aria-label="Show photos from"
        />
      </div>
      <div v-if="photos.length" class="lp-actions">
        <Button
          v-if="selectedIds.length"
          variant="danger"
          size="sm"
          data-test="delete-selected"
          :disabled="busy"
          @click="askDeleteSelected"
        >
          Delete selected ({{ selectedIds.length }})
        </Button>
        <Button v-if="selectedIds.length" size="sm" :disabled="busy" @click="clearSelection">
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          :icon="mdiUpload"
          :loading="uploading"
          loading-label="Uploading…"
          :disabled="deleting"
          data-test="local-photos-upload"
          @click="openPicker"
        >
          Upload photos
        </Button>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      hidden
      data-test="local-photos-input"
      @change="onFiles"
    />

    <InlineNote v-if="status" :tone="status.tone" role="status" class="lp-status">
      {{ status.text }}
    </InlineNote>

    <div v-if="!photos.length" data-test="local-photos-empty">
      <EmptyState
        compact
        :icon="mdiImageMultipleOutline"
        title="No photos yet."
        help="Upload photos from this device to fill Local photos."
        action-label="Upload photos"
        @action="openPicker"
      />
    </div>

    <div v-else-if="!filteredPhotos.length" data-test="local-photos-filtered-empty">
      <EmptyState
        compact
        :icon="mdiImageOutline"
        :title="`No photos in ${currentFilterLabel} yet.`"
        :help="filteredEmptyHelp"
        :action-label="folderFilter === ROOT_FILTER ? 'Upload photos' : ''"
        @action="openPicker"
      />
    </div>

    <ul v-else class="lp-grid" data-test="photo-grid">
      <li v-for="photo in filteredPhotos" :key="photo.id">
        <Card
          class="lp-tile"
          :class="{ 'lp-tile--selected': isSelected(photo) }"
          :data-photo-id="photo.id"
          data-test="photo-tile"
        >
          <div class="lp-thumb">
            <img
              :src="`/api/images/${photo.id}/thumbnail`"
              :alt="photo.filename"
              loading="lazy"
              decoding="async"
            />
            <IconButton
              class="lp-select"
              size="md"
              :icon="isSelected(photo) ? mdiCheckboxMarkedCircle : mdiCircleOutline"
              :label="`${isSelected(photo) ? 'Unselect' : 'Select'} ${photo.filename}`"
              :aria-pressed="isSelected(photo) ? 'true' : 'false'"
              @click="toggleSelect(photo)"
            />
          </div>
          <div class="lp-body">
            <span class="lp-name" :title="photo.filename" data-test="photo-name">
              {{ photo.filename }}
            </span>
            <span class="lp-meta">{{ metaFor(photo) }}</span>
          </div>
        </Card>
      </li>
    </ul>

    <ConfirmModal
      :show="pendingDelete.length > 0"
      :title="deleteTitle"
      :message="deleteMessage"
      confirm-text="Delete"
      :danger="true"
      @confirm="confirmDelete"
      @cancel="pendingDelete = []"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import {
  mdiCheckboxMarkedCircle,
  mdiChevronLeft,
  mdiCircleOutline,
  mdiImageMultipleOutline,
  mdiImageOutline,
  mdiUpload,
} from "@mdi/js";
import { useImagesStore } from "@/stores/images";
import { useShareLinksStore } from "@/stores/shareLinks";
import { formatKeyDate } from "@/utils/apiKeyFormat";
import { errorDetailMessage } from "@/utils/apiErrors";
import { logError } from "@/utils/logger";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import IconButton from "@/components/ui/IconButton.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";

// Settings › Content › Photos › Local photos: the owner's own library
// (calvin-n2my). It is the source's own sub-view, so it starts from the shared
// Content list and returns there with Back. The library is plain files, so the
// browser reads the existing image list, upload and delete routes; folders are
// the share-link folders the backend already scans, named from the share-link
// admin API when a link uses one.

defineEmits(["close"]);

const LOCAL_PHOTOS_ID = "local-images";
const ALL_FILTER = "@all";
const ROOT_FILTER = "@root";

const imagesStore = useImagesStore();
const shareLinks = useShareLinksStore();

const fileInput = ref(null);
const folderFilter = ref(ALL_FILTER);
const selectedIds = ref([]);
const pendingDelete = ref([]);
const uploading = ref(false);
const deleting = ref(false);
const busy = computed(() => uploading.value || deleting.value);
const status = ref(null);

const photos = computed(() => {
  const list = imagesStore.getImagesForSource([LOCAL_PHOTOS_ID]) || [];
  return [...list]
    .filter(image => image.source === LOCAL_PHOTOS_ID)
    .sort((a, b) => new Date(b.modified || 0) - new Date(a.modified || 0));
});

const linkForFolder = folder => shareLinks.links.find(link => link.folder === folder) || null;

const folderLabel = folder => {
  if (!folder) return "Library";
  return linkForFolder(folder)?.name || folder;
};

// The backend scans only marker folders, so the photo list and the folder API
// agree; merging keeps a chip for a folder whose share link was just revoked
// and for any folder the folder read missed.
const folders = computed(() => {
  const names = new Set(shareLinks.folders);
  for (const photo of photos.value) {
    if (photo.folder) names.add(photo.folder);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
});

const filterOptions = computed(() => [
  { value: ALL_FILTER, label: "All" },
  { value: ROOT_FILTER, label: "Library" },
  ...folders.value.map(folder => ({ value: folder, label: folderLabel(folder) })),
]);

const currentFilterLabel = computed(() => {
  if (folderFilter.value === ALL_FILTER) return "Local photos";
  if (folderFilter.value === ROOT_FILTER) return "Library";
  return folderLabel(folderFilter.value);
});

const filteredPhotos = computed(() => {
  if (folderFilter.value === ALL_FILTER) return photos.value;
  if (folderFilter.value === ROOT_FILTER) return photos.value.filter(photo => !photo.folder);
  return photos.value.filter(photo => photo.folder === folderFilter.value);
});

const filteredEmptyHelp = computed(() =>
  folderFilter.value === ROOT_FILTER
    ? "Upload photos from this device to fill the library."
    : "Photos sent with the share link land here."
);

const countLabel = computed(() => {
  const total = photos.value.length;
  if (folderFilter.value !== ALL_FILTER && filteredPhotos.value.length !== total) {
    return `${filteredPhotos.value.length} of ${total} ${total === 1 ? "photo" : "photos"}`;
  }
  return `${total} ${total === 1 ? "photo" : "photos"}`;
});

const guestLine = photo => {
  if (!photo.folder) return "";
  return `From ${folderLabel(photo.folder)}`;
};

const metaFor = photo =>
  [formatKeyDate(photo.modified), guestLine(photo)].filter(Boolean).join(" · ");

const isSelected = photo => selectedIds.value.includes(photo.id);

const toggleSelect = photo => {
  selectedIds.value = isSelected(photo)
    ? selectedIds.value.filter(id => id !== photo.id)
    : [...selectedIds.value, photo.id];
};

const clearSelection = () => {
  selectedIds.value = [];
};

watch(folderFilter, clearSelection);

const selectedPhotos = computed(() =>
  selectedIds.value.map(id => photos.value.find(photo => photo.id === id)).filter(Boolean)
);

const deleteTitle = computed(() => {
  if (pendingDelete.value.length === 1) return `Delete ${pendingDelete.value[0].filename}?`;
  return `Delete ${pendingDelete.value.length} photos?`;
});

const deleteMessage = computed(() =>
  pendingDelete.value.length === 1
    ? "It's removed from Local photos and stops showing in the rotation."
    : "They're removed from Local photos and stop showing in the rotation."
);

const openPicker = () => fileInput.value?.click();

const refresh = async () => {
  await imagesStore.fetchImages([LOCAL_PHOTOS_ID]);
};

const onFiles = async event => {
  const files = Array.from(event.target?.files || []);
  if (files.length === 0) return;
  uploading.value = true;
  status.value = null;
  let ok = 0;
  const failed = [];
  for (const file of files) {
    try {
      await imagesStore.uploadImage(file);
      ok += 1;
    } catch (error) {
      failed.push(`${file.name}: ${errorDetailMessage(error, "failed")}`);
    }
  }
  uploading.value = false;
  if (event.target) event.target.value = "";
  folderFilter.value = ROOT_FILTER;
  try {
    await refresh();
  } catch (error) {
    logError("[LocalPhotosBrowser]", "Failed to reload Local photos:", error);
  }
  status.value = failed.length
    ? {
        tone: "err",
        text: `Uploaded ${ok} of ${files.length}. ${failed.join("; ")}`,
      }
    : { tone: "ok", text: `Uploaded ${ok} ${ok === 1 ? "photo" : "photos"}.` };
};

const askDeleteSelected = () => {
  pendingDelete.value = [...selectedPhotos.value];
};

const confirmDelete = async () => {
  const targets = pendingDelete.value;
  pendingDelete.value = [];
  if (targets.length === 0) return;
  deleting.value = true;
  status.value = null;
  let ok = 0;
  const failed = [];
  for (const photo of targets) {
    try {
      await imagesStore.deleteImage(photo.id);
      ok += 1;
    } catch (error) {
      failed.push(`${photo.filename}: ${errorDetailMessage(error, "failed")}`);
    }
  }
  deleting.value = false;
  selectedIds.value = [];
  try {
    await refresh();
  } catch (error) {
    logError("[LocalPhotosBrowser]", "Failed to reload Local photos:", error);
  }
  status.value = failed.length
    ? {
        tone: "err",
        text: `Deleted ${ok} of ${targets.length}. ${failed.join("; ")}`,
      }
    : { tone: "ok", text: `Deleted ${ok} ${ok === 1 ? "photo" : "photos"}.` };
};

onMounted(async () => {
  try {
    await Promise.all([refresh(), shareLinks.fetchLinks(), shareLinks.fetchFolders()]);
  } catch (error) {
    logError("[LocalPhotosBrowser]", "Failed to load Local photos:", error);
    status.value = { tone: "err", text: "Couldn't load Local photos." };
  }
});
</script>

<style scoped>
.local-photos {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}

.lp-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--gap-inline);
}

.lp-heading {
  display: flex;
  flex: 1 1 10rem;
  flex-direction: column;
  gap: var(--gap-tight);
  min-width: 0;
}

.lp-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-title);
  font-weight: var(--weight-title);
  color: var(--ink);
}

.lp-count {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  color: var(--ink-2);
}

.lp-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-inline);
}

.lp-filters {
  max-width: 100%;
  overflow-x: auto;
}

.lp-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-inline);
  margin-left: auto;
}

.lp-status {
  margin: 0;
}

.lp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: var(--gap-stack);
  margin: 0;
  padding: 0;
  list-style: none;
}

.lp-grid > li {
  min-width: 0;
}

.lp-tile {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
  height: 100%;
}

.lp-tile--selected {
  border-color: var(--focus);
  background: color-mix(in srgb, var(--focus) 16%, var(--bg-1));
}

.lp-thumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--radius-control);
  background: var(--bg-0);
}

.lp-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lp-select {
  position: absolute;
  top: var(--gap-1);
  right: var(--gap-1);
}

.lp-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-tight);
  min-width: 0;
}

.lp-name {
  overflow: hidden;
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-meta {
  overflow: hidden;
  font-family: var(--font-ui);
  font-size: var(--text-meta);
  color: var(--ink-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
