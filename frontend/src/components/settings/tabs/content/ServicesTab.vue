<template>
  <div class="services-tab">
    <OrderingManager
      type="service"
      :plugins="servicePlugins"
      :plugin-instances="servicePluginInstances"
      :display-orders="servicePluginDisplayOrders"
      :get-instance-summary="getInstanceSummary"
      @plugin-order-change="handleServicePluginOrderChange"
      @instance-order-change="handleServiceInstanceOrderChange"
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
  pluginDisplayOrders,
  loadingPlugins,
  loadPlugins,
  updatePluginOrder,
  updateInstanceOrder,
} = usePlugins();

// Ensure plugins are loaded
onMounted(async () => {
  if (plugins.value.length === 0 && !loadingPlugins.value) {
    await loadPlugins();
  }
});

const servicePlugins = computed(() => {
  const filtered = plugins.value.filter(
    (p) => p.type === "service" && p.enabled,
  );
  // Sort by display order
  return filtered.sort((a, b) => {
    const orderA = pluginDisplayOrders.value[a.id] ?? 0;
    const orderB = pluginDisplayOrders.value[b.id] ?? 0;
    return orderA - orderB;
  });
});

const servicePluginInstances = computed(() => {
  const instances = {};
  servicePlugins.value.forEach((plugin) => {
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

const servicePluginDisplayOrders = computed(() => pluginDisplayOrders.value);

const getInstanceSummary = (pluginId, config) => {
  // Simple summary - can be enhanced
  return null;
};

const handleServicePluginOrderChange = async (newOrder) => {
  // Update plugin order
  for (let i = 0; i < newOrder.length; i++) {
    await updatePluginOrder(newOrder[i].id, i);
  }
};

const handleServiceInstanceOrderChange = async (pluginId, newOrder) => {
  await updateInstanceOrder(pluginId, newOrder);
};
</script>

<style scoped>
.services-tab {
  width: 100%;
}
</style>
