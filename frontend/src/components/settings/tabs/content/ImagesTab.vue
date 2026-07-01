<template>
  <div class="images-tab">
    <OrderingManager
      type="image"
      :plugins="imagePlugins"
      :plugin-instances="imagePluginInstances"
      :display-orders="imagePluginDisplayOrders"
      :get-instance-summary="getInstanceSummary"
      @plugin-order-change="handleImagePluginOrderChange"
      @instance-order-change="handleImageInstanceOrderChange"
    />
  </div>
</template>

<script setup>
import { computed, onMounted } from "vue";
import { usePlugins } from "@/composables";
import OrderingManager from "../../specialized/OrderingManager.vue";

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
  const filtered = plugins.value.filter(p => p.type === "image" && p.enabled);
  // Sort by display order
  return [...filtered].sort((a, b) => {
    const orderA = imagePluginDisplayOrders.value[a.id] ?? 0;
    const orderB = imagePluginDisplayOrders.value[b.id] ?? 0;
    return orderA - orderB;
  });
});

const imagePluginInstances = computed(() => {
  const instances = {};
  imagePlugins.value.forEach(plugin => {
    const pluginInsts = pluginInstances.value[plugin.id] || [];
    // Sort instances by display_order
    instances[plugin.id] = [...pluginInsts].sort((a, b) => {
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

const handleImagePluginOrderChange = async newOrder => {
  // Update local state optimistically first for instant feedback
  for (let i = 0; i < newOrder.length; i++) {
    const plugin = newOrder[i];
    if (plugin && plugin.id) {
      imagePluginDisplayOrders.value[plugin.id] = i;
    }
  }

  // Update backend in parallel (fire and forget - errors are handled silently)
  try {
    const updatePromises = [];
    for (let i = 0; i < newOrder.length; i++) {
      const plugin = newOrder[i];
      if (!plugin || !plugin.id) {
        continue;
      }
      updatePromises.push(
        updateImagePluginOrder(plugin.id, i).catch(error => {
          console.error(`[ImagesTab] Failed to update order for ${plugin.id}:`, error);
          // Restore previous order on error
          return loadPlugins().catch(() => {});
        })
      );
    }

    // Wait for all updates to complete (in background, no blocking)
    Promise.all(updatePromises).catch(() => {
      // Silent error handling - already logged above
    });
  } catch (error) {
    console.error("Failed to update plugin order:", error);
    // Restore state on critical error
    await loadPlugins();
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
</style>
