<template>
  <div class="plugin-field">
    <label>{{
      (schema && typeof schema === "object" && schema.description) || fieldKey
    }}</label>

    <!-- Directory input with browse button -->
    <div v-if="ui && ui.component === 'directory'" class="directory-input">
      <input
        type="text"
        :value="value"
        :placeholder="ui.placeholder || 'Select directory...'"
        class="form-input"
        @input="$emit('update', $event.target.value)"
      />
      <button
        v-if="ui.browse_button"
        type="button"
        class="btn-secondary"
        @click="openDirectoryBrowser"
        :disabled="browsing"
      >
        {{ browsing ? "Loading..." : "Browse" }}
      </button>

      <!-- Directory Browser Modal -->
      <div
        v-if="showDirectoryBrowser"
        class="directory-browser-modal"
        @click.self="closeDirectoryBrowser"
      >
        <div class="directory-browser-content">
          <div class="directory-browser-header">
            <h3>Select Directory</h3>
            <button
              type="button"
              class="close-button"
              @click="closeDirectoryBrowser"
            >
              ×
            </button>
          </div>
          <div class="directory-browser-body">
            <div class="directory-browser-path">
              <button
                v-if="
                  parentPath ||
                  (currentPath && currentPath !== '/' && currentPath !== 'C:\\')
                "
                type="button"
                class="btn-link"
                @click="navigateToParent"
              >
                ↑ Parent
              </button>
              <span class="current-path">{{ currentPath || "/" }}</span>
            </div>
            <div v-if="loading" class="loading">Loading...</div>
            <div v-else-if="error" class="error">{{ error }}</div>
            <div v-else class="directory-list">
              <div
                v-for="item in directoryItems"
                :key="item.path"
                class="directory-item"
                :class="{ 'is-directory': item.is_directory }"
                @click="
                  item.is_directory ? navigateToDirectory(item.path) : null
                "
                @dblclick="
                  item.is_directory
                    ? navigateToDirectory(item.path)
                    : selectDirectory(item.path)
                "
              >
                <span class="directory-icon">{{
                  item.is_directory ? "📁" : "📄"
                }}</span>
                <span class="directory-name">{{ item.name }}</span>
              </div>
              <div v-if="directoryItems.length === 0" class="empty-directory">
                This directory is empty
              </div>
            </div>
          </div>
          <div class="directory-browser-footer">
            <button
              type="button"
              class="btn-secondary"
              @click="closeDirectoryBrowser"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn-primary"
              @click="selectDirectory(currentPath)"
              :disabled="!currentPath"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Text input -->
    <input
      v-else-if="ui && ui.component === 'input'"
      type="text"
      :value="value"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Password input -->
    <input
      v-else-if="ui && ui.component === 'password'"
      type="password"
      :value="value"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Number input -->
    <input
      v-else-if="ui && ui.component === 'number'"
      type="number"
      :value="value"
      :min="ui.min"
      :max="ui.max"
      :placeholder="ui.placeholder"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Select dropdown -->
    <select
      v-else-if="ui && ui.component === 'select'"
      :value="value"
      class="form-input"
      @change="$emit('update', $event.target.value)"
    >
      <option
        v-for="option in ui.options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label || option.value }}
      </option>
    </select>

    <!-- Textarea -->
    <textarea
      v-else-if="ui && ui.component === 'textarea'"
      :value="value"
      :placeholder="ui.placeholder"
      class="form-input"
      rows="3"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Fallback: Default input based on schema type -->
    <input
      v-else-if="
        schema && typeof schema === 'object' && schema.type === 'string'
      "
      type="text"
      :value="value"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />
    <input
      v-else-if="
        schema && typeof schema === 'object' && schema.type === 'password'
      "
      type="password"
      :value="value"
      class="form-input"
      @input="$emit('update', $event.target.value)"
    />

    <!-- Help text and links -->
    <span
      v-if="ui && (ui.help_text || ui.help_link)"
      class="help-text"
      style="display: block; margin-top: 0.5rem"
    >
      <span v-if="ui.help_text">{{ ui.help_text }}</span>
      <a
        v-if="ui.help_link"
        :href="ui.help_link"
        target="_blank"
        rel="noopener noreferrer"
        style="color: var(--accent-color); text-decoration: underline"
      >
        {{ ui.help_link }}
      </a>
    </span>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import axios from "axios";

const props = defineProps({
  pluginId: {
    type: String,
    required: true,
  },
  fieldKey: {
    type: String,
    required: true,
  },
  schema: {
    type: Object,
    default: () => ({}),
  },
  value: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update"]);

const ui = computed(() => {
  return props.schema && typeof props.schema === "object"
    ? props.schema.ui
    : null;
});

// Directory browser state
const showDirectoryBrowser = ref(false);
const currentPath = ref("/");
const parentPath = ref(null);
const directoryItems = ref([]);
const loading = ref(false);
const error = ref(null);
const browsing = ref(false);

const openDirectoryBrowser = async () => {
  browsing.value = true;
  showDirectoryBrowser.value = true;
  // Start from current value if it exists and is a valid path, otherwise start from root
  const startPath =
    props.value && props.value.trim() ? props.value.trim() : "/";
  currentPath.value = startPath;
  await loadDirectory(startPath);
  browsing.value = false;
};

const closeDirectoryBrowser = () => {
  showDirectoryBrowser.value = false;
  currentPath.value = "/";
  parentPath.value = null;
  directoryItems.value = [];
  error.value = null;
};

const loadDirectory = async (path) => {
  loading.value = true;
  error.value = null;
  try {
    const response = await axios.get("/api/plugins/directories", {
      params: { path },
    });
    currentPath.value = response.data.current_path;
    parentPath.value = response.data.parent_path;
    directoryItems.value = response.data.items.filter(
      (item) => item.is_directory,
    );
  } catch (err) {
    error.value =
      err.response?.data?.detail || err.message || "Failed to load directory";
    console.error("Error loading directory:", err);
  } finally {
    loading.value = false;
  }
};

const navigateToDirectory = async (path) => {
  await loadDirectory(path);
};

const navigateToParent = async () => {
  if (parentPath.value) {
    await loadDirectory(parentPath.value);
  } else if (
    currentPath.value &&
    currentPath.value !== "/" &&
    currentPath.value !== "C:\\"
  ) {
    // Fallback: calculate parent path manually
    const pathParts = currentPath.value
      .replace(/\\/g, "/")
      .split("/")
      .filter((p) => p);
    if (pathParts.length > 0) {
      pathParts.pop();
      const parent = pathParts.length > 0 ? "/" + pathParts.join("/") : "/";
      await loadDirectory(parent);
    } else {
      await loadDirectory("/");
    }
  }
};

const selectDirectory = (path) => {
  if (path) {
    emit("update", path);
    closeDirectoryBrowser();
  }
};
</script>

<style scoped>
.plugin-field {
  margin-bottom: 1rem;
}

.plugin-field label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-primary);
}

.directory-input {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.directory-input .form-input {
  flex: 1;
}

.file-input-hidden {
  display: none;
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-secondary);
  border-color: var(--accent-primary);
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.form-input::placeholder {
  color: var(--text-secondary);
}

.help-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
  display: block;
}

.help-text a {
  color: var(--accent-color);
  text-decoration: underline;
}

/* Directory Browser Modal */
.directory-browser-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.directory-browser-content {
  background: var(--bg-primary);
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.directory-browser-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.directory-browser-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.close-button:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.directory-browser-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.directory-browser-path {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.5rem;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.current-path {
  flex: 1;
  font-family: monospace;
  font-size: 0.9rem;
  color: var(--text-primary);
  word-break: break-all;
}

.btn-link {
  background: none;
  border: none;
  color: var(--accent-color);
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  text-decoration: underline;
  font-size: 0.9rem;
}

.btn-link:hover {
  color: var(--accent-primary);
}

.directory-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.directory-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.directory-item.is-directory:hover {
  background: var(--bg-secondary);
}

.directory-item.is-directory {
  cursor: pointer;
}

.directory-icon {
  font-size: 1.2rem;
}

.directory-name {
  flex: 1;
  color: var(--text-primary);
}

.loading,
.error,
.empty-directory {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.error {
  color: var(--error-color, #ff4444);
}

.directory-browser-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem;
  border-top: 1px solid var(--border-color);
}

.btn-primary {
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-primary);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
