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
      @order-input-change="handleServiceOrderInputChange"
    />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { usePlugins } from "@/composables";
import OrderingManager from "../../specialized/OrderingManager.vue";

const {
  plugins,
  pluginInstances,
  pluginDisplayOrders,
  updatePluginOrder,
  updateInstanceOrder,
} = usePlugins();

const servicePlugins = computed(() => {
  return plugins.value.filter((p) => p.type === "service" && p.enabled);
});

const servicePluginInstances = computed(() => {
  const instances = {};
  servicePlugins.value.forEach((plugin) => {
    instances[plugin.id] = pluginInstances.value[plugin.id] || [];
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

const handleServiceOrderInputChange = async (pluginId, value) => {
  await updatePluginOrder(pluginId, value);
};
</script>

<style scoped>
.services-tab {
  width: 100%;
}
</style>
