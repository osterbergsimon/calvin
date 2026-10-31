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
      hidden
      data-test="photo-upload-input"
      @change="onFiles"
    />
    <Button
      data-test="photo-upload-btn"
      variant="primary"
      :loading="uploading"
      loading-label="Uploading…"
      @click="fileInput?.click()"
    >
      Choose photos
    </Button>
  </SettingRow>
  <InlineNote
    v-if="status"
    class="photo-upload__status"
    :tone="status.kind === 'ok' ? 'ok' : 'err'"
    role="status"
  >
    {{ status.text }}
  </InlineNote>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useImagesStore } from "@/stores/images";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import Button from "@/components/ui/Button.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import { errorDetailMessage } from "@/utils/apiErrors";

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
      failed.push(`${file.name}: ${errorDetailMessage(err, "failed")}`);
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
