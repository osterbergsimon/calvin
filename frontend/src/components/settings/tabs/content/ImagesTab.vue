<template>
  <div class="images-tab">
    <div class="ordering-container" :class="{ loading: updatingOrder }">
      <OrderingManager
        type="image"
        :plugins="imagePlugins"
        :plugin-instances="imagePluginInstances"
        :display-orders="imagePluginDisplayOrders"
        :get-instance-summary="getInstanceSummary"
        @plugin-order-change="handleImagePluginOrderChange"
        @instance-order-change="handleImageInstanceOrderChange"
      />
      <div v-if="updatingOrder" class="loading-overlay">
        <div class="loading-spinner">
          <div class="spinner" />
          <div class="loading-text">Updating order...</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { usePlugins } from "@/composables";
import OrderingManager from "../../specialized/OrderingManager.vue";

const updatingOrder = ref(false);

const {
  plugins,
  pluginInstances,
  imagePluginDisplayOrders,
  loadingPlugins,
  loadPlugins,
  updateImagePluginOrder,
  updateImageInstanceOrder,
} = usePlugins();

// Ensure plugins are loaded
onMounted(async () => {
  if (plugins.value.length === 0 && !loadingPlugins.value) {
    await loadPlugins();
  }
});

const imagePlugins = computed(() => {
  const filtered = plugins.value.filter((p) => p.type === "image" && p.enabled);
  // Sort by display order
  return filtered.sort((a, b) => {
    const orderA = imagePluginDisplayOrders.value[a.id] ?? 0;
    const orderB = imagePluginDisplayOrders.value[b.id] ?? 0;
    return orderA - orderB;
  });
});

const imagePluginInstances = computed(() => {
  const instances = {};
  imagePlugins.value.forEach((plugin) => {
    const pluginInsts = pluginInstances.value[plugin.id] || [];
    // Sort instances by display_order
    instances[plugin.id] = pluginInsts.sort((a, b) => {
      const orderA = a.display_order ?? 0;
      const orderB = b.display_order ?? 0;
      return orderA - orderB;
    });
  });
  return instances;
});

const getInstanceSummary = (_pluginId, _config) => {
  // Simple summary - can be enhanced
  return null;
};

const handleImagePluginOrderChange = async (newOrder) => {
  updatingOrder.value = true;
  try {
    // Update plugin order for all plugins
    // updateImagePluginOrder already updates local state, so no reload needed
    for (let i = 0; i < newOrder.length; i++) {
      await updateImagePluginOrder(newOrder[i].id, i);
    }
    // Brief delay for visual feedback, but keep it short
    await new Promise((resolve) => setTimeout(resolve, 100));
  } catch (error) {
    console.error("Failed to update plugin order:", error);
    // Reload to restore correct state on error
    await loadPlugins();
    throw error;
  } finally {
    updatingOrder.value = false;
  }
};

const handleImageInstanceOrderChange = async (pluginId, newOrder) => {
  await updateImageInstanceOrder(pluginId, newOrder);
};
</script>

<style scoped>
.images-tab {
  width: 100%;
}

.ordering-container {
  position: relative;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-primary);
  opacity: 0.9;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(2px);
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: var(--text-primary);
  font-size: 0.9rem;
}
</style>
