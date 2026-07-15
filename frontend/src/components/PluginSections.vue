<template>
  <div v-if="sections && sections.length > 0">
    <div v-for="section in sections" :key="section.id" class="plugin-section">
      <!-- Upload Section -->
      <div v-if="section.type === 'upload'" class="upload-section">
        <h4 class="config-section-title">
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

      <!-- Manage Images Section -->
      <div
        v-else-if="section.type === 'manage_images'"
        class="manage-images-section"
        style="margin-top: 1.5rem"
      >
        <div
          v-if="section.collapsible"
          class="config-section-title collapsible-header"
          style="
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
          "
          @click="toggleSection(section.id)"
        >
          <h4 style="margin: 0">
            {{ section.title || "Manage Images" }}
            <span v-if="imageCount !== undefined"> ({{ imageCount }})</span>
          </h4>
          <span style="font-size: 0.9rem; color: var(--ink-2)">
            {{ expandedSections[section.id] ? "▼" : "▶" }}
          </span>
        </div>
        <h4 v-else class="config-section-title">
          {{ section.title || "Manage Images" }}
        </h4>

        <div
          v-show="!section.collapsible || expandedSections[section.id]"
          class="images-list"
          style="margin-top: 1rem; max-height: 400px; overflow-y: auto"
        >
          <div v-for="image in filteredImages" :key="image.id" class="image-item">
            <div class="image-thumbnail">
              <img
                :src="`/api/images/${image.id}/thumbnail`"
                :alt="image.filename"
                class="thumbnail-img"
                loading="lazy"
                decoding="async"
                @error="handleThumbnailError"
              />
            </div>
            <div class="image-info">
              <strong>{{ image.filename }}</strong>
              <span class="image-details">
                {{ image.width }}×{{ image.height }} •
                {{ formatFileSize(image.size) }}
              </span>
            </div>
            <button
              v-if="
                !image.url ||
                (!image.url.startsWith('http://') && !image.url.startsWith('https://'))
              "
              class="btn-remove"
              title="Delete image"
              @click="$emit('delete-image', image.id)"
            >
              Delete
            </button>
            <span v-else class="btn-remove-disabled" title="Cannot delete remote images">
              Remote
            </span>
          </div>
          <div v-if="filteredImages.length === 0" class="empty-state">
            <p>No images available</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  pluginId: {
    type: String,
    required: true,
  },
  pluginInstances: {
    type: Array,
    default: () => [],
  },
  sections: {
    type: Array,
    default: () => [],
  },
  images: {
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

const emit = defineEmits(["upload", "delete-image"]);

const expandedSections = ref({});
const fileInputs = ref({});

// Filter images to only show those belonging to this plugin
// Match by instance plugin_id (image.source) against plugin instances
// For single-instance plugins, also match against common instance_id patterns
const filteredImages = computed(() => {
  // Get all instance plugin_ids for this plugin type
  const instanceIds = props.pluginInstances.map(inst => inst.id || inst.plugin_id);

  // Also add common single-instance patterns (e.g., "local-images" for "local" plugin)
  const commonInstanceIds = [
    `${props.pluginId}-images`, // e.g., "local-images"
    `${props.pluginId}-instance`, // e.g., "local-instance"
  ];

  // Combine all possible plugin_ids
  const allPluginIds = [...instanceIds, ...commonInstanceIds, props.pluginId];

  // Filter images where source matches any of the plugin_ids
  return props.images.filter(image => {
    if (!image.source) return false;
    return allPluginIds.includes(image.source);
  });
});

const imageCount = computed(() => {
  return filteredImages.value.length;
});

const toggleSection = sectionId => {
  expandedSections.value[sectionId] = !expandedSections.value[sectionId];
};

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

const handleThumbnailError = event => {
  event.target.src = "/placeholder-thumbnail.png";
};

const formatFileSize = bytes => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};
</script>

<style scoped>
.plugin-section {
  margin-top: 1.5rem;
}

.upload-section {
  margin-top: 1rem;
}

.manage-images-section {
  margin-top: 1.5rem;
}

.collapsible-header {
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
}

.images-list {
  margin-top: 1rem;
  max-height: 400px;
  overflow-y: auto;
}

.image-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--line);
}

.image-thumbnail {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
}

.image-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.image-details {
  font-size: 0.875rem;
  color: var(--ink-2);
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--ink-2);
}

.btn-upload {
  background: var(--focus);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
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

.btn-remove {
  background: var(--err);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-remove:hover {
  background: var(--err);
  opacity: 0.9;
}

.btn-remove-disabled {
  color: var(--ink-2);
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  opacity: 0.6;
  user-select: none;
}

.success-message {
  background: var(--accent-success, #10b981);
  color: #fff;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.error-message {
  background: var(--err);
  color: #fff;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.help-text {
  font-size: 0.875rem;
  color: var(--ink-2);
  margin-top: 0.5rem;
  display: block;
}

.config-section-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--ink);
}
</style>
