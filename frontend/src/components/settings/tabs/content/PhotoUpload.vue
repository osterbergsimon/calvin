<template>
  <SettingRow
    label="Add photos"
    :description="`Upload JPG, PNG, WebP or GIF files into Local photos. ${countLabel}`"
  >
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="photo-upload__input"
      data-test="photo-upload-input"
      @change="onFiles"
    />
    <button
      type="button"
      class="photo-upload__btn"
      data-test="photo-upload-btn"
      :disabled="uploading"
      @click="fileInput?.click()"
    >
      {{ uploading ? "Uploading…" : "Choose photos" }}
    </button>
  </SettingRow>
  <p v-if="status" class="photo-upload__status" :class="`is-${status.kind}`" role="status">
    {{ status.text }}
  </p>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useImagesStore } from "@/stores/images";
import SettingRow from "@/components/settings/shell/SettingRow.vue";

// The landing spot for the dashboard's "Add photos" button (F3): upload right
// here instead of hunting for the Local Images card under Plugins.
const imagesStore = useImagesStore();
const fileInput = ref(null);
const uploading = ref(false);
const status = ref(null);

const countLabel = computed(() => {
  const n = imagesStore.images?.length ?? 0;
  return n === 1 ? "1 photo so far." : `${n} photos so far.`;
});

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
    } catch (err) {
      failed.push(`${file.name}: ${err.response?.data?.detail || err.message || "failed"}`);
    }
  }
  uploading.value = false;
  if (event.target) event.target.value = "";
  status.value = failed.length
    ? { kind: "error", text: `Uploaded ${ok} of ${files.length}. ${failed.join("; ")}` }
    : { kind: "ok", text: `Uploaded ${ok} ${ok === 1 ? "photo" : "photos"}.` };
};

// The photo picker's "Upload from this device" tile opens this row's picker,
// so there is still exactly one upload path.
const openFilePicker = () => fileInput.value?.click();

defineExpose({ openFilePicker });

onMounted(() => {
  if (!imagesStore.images?.length) void imagesStore.fetchImages();
});
</script>

<style scoped>
.photo-upload__input {
  display: none;
}
.photo-upload__btn {
  min-height: var(--touch-target);
  padding: 0 1.1rem;
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--focus-ink);
  background: var(--focus);
  border: 0;
  border-radius: 10px;
  cursor: pointer;
}
.photo-upload__btn:disabled {
  opacity: 0.6;
  cursor: progress;
}
.photo-upload__btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.photo-upload__status {
  margin: 0;
  padding: 0 1.25rem 0.75rem;
  font-size: 0.9rem;
}
.photo-upload__status.is-ok {
  color: var(--ok);
}
.photo-upload__status.is-error {
  color: var(--err);
}
</style>
