<template>
  <div v-if="sections && sections.length > 0">
    <div v-for="section in sections" :key="section.id" class="plugin-section">
      <!-- Upload Section -->
      <div v-if="section.type === 'upload'" class="upload-section">
        <h4 class="config-section-title heading-group">
          {{ section.title || "Upload" }}
        </h4>
        <input
          :ref="
            el => {
              if (el) fileInputs[section.id] = el;
            }
          "
          type="file"
          :accept="section.accept || 'image/*'"
          :multiple="section.multiple || false"
          style="display: none"
          @change="handleFileSelect"
        />
        <button class="btn-upload" :disabled="uploading" @click="triggerFileInput(section.id)">
          {{ uploading ? "Uploading..." : "Choose Files" }}
        </button>
        <span v-if="section.help_text" class="help-text">
          {{ section.help_text }}
        </span>
        <div v-if="uploadError" class="error-message">
          {{ uploadError }}
        </div>
        <div v-if="uploadSuccess" class="success-message">
          {{ uploadSuccess }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";

// Upload is the only ui_section the host still renders: the retired
// manage_images list lived here but was unreachable (the plugin card no longer
// opened) and is replaced by the Local photos browser in Content (calvin-n2my).
const props = defineProps({
  sections: {
    type: Array,
    default: () => [],
  },
  uploading: {
    type: Boolean,
    default: false,
  },
  uploadError: {
    type: String,
    default: "",
  },
  uploadSuccess: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["upload"]);

const fileInputs = ref({});

const triggerFileInput = sectionId => {
  const input = fileInputs.value[sectionId];
  if (input) {
    input.click();
  }
};

const handleFileSelect = event => {
  const files = event.target.files;
  if (files && files.length > 0) {
    // Find the section that matches this file input
    const section = props.sections.find(s => s.type === "upload");
    if (section) {
      // Convert FileList to Array to avoid serialization issues
      const filesArray = Array.from(files);
      emit("upload", filesArray, section);
    }
  }
  event.target.value = "";
};
</script>

<style scoped>
.plugin-section {
  margin-top: 1.5rem;
}

.upload-section {
  margin-top: 1rem;
}

.btn-upload {
  background: var(--focus);
  color: var(--focus-ink);
  border: none;
  border-radius: var(--radius-xs);
  padding: 0.75rem 1.5rem;
  font-size: var(--fs-md);
  cursor: pointer;
  transition: all var(--dur) ease;
  font-weight: var(--weight-strong);
}

.btn-upload:hover:not(:disabled) {
  background: var(--focus);
  opacity: 0.9;
}

.btn-upload:disabled {
  background: var(--ink-3);
  cursor: not-allowed;
  opacity: 0.6;
}

.success-message {
  background: var(--accent-success, var(--ok));
  color: var(--ok-ink);
  padding: 0.75rem 1rem;
  border-radius: var(--radius-xs);
  margin-top: 0.5rem;
  font-size: var(--fs-control);
}

.error-message {
  background: var(--err);
  color: var(--err-ink);
  padding: 0.75rem 1rem;
  border-radius: var(--radius-xs);
  margin-top: 0.5rem;
  font-size: var(--fs-control);
}

.help-text {
  font-size: var(--fs-control);
  color: var(--ink-2);
  margin-top: 0.5rem;
  display: block;
}

.config-section-title {
  margin-bottom: var(--gap-4);
}
</style>
