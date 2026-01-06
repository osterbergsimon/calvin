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
      @order-input-change="handleImageOrderInputChange"
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
  imagePluginDisplayOrders,
  updateImagePluginOrder,
  updateImageInstanceOrder,
} = usePlugins();

const imagePlugins = computed(() => {
  return plugins.value.filter((p) => p.type === "image" && p.enabled);
});

const imagePluginInstances = computed(() => {
  const instances = {};
  imagePlugins.value.forEach((plugin) => {
    instances[plugin.id] = pluginInstances.value[plugin.id] || [];
  });
  return instances;
});

const getInstanceSummary = (pluginId, config) => {
  // Simple summary - can be enhanced
  return null;
};

const handleImagePluginOrderChange = async (newOrder) => {
  // Update plugin order
  for (let i = 0; i < newOrder.length; i++) {
    await updateImagePluginOrder(newOrder[i].id, i);
  }
};

const handleImageInstanceOrderChange = async (pluginId, newOrder) => {
  await updateImageInstanceOrder(pluginId, newOrder);
};

const handleImageOrderInputChange = async (pluginId, value) => {
  await updateImagePluginOrder(pluginId, value);
};
</script>

<style scoped>
.images-tab {
  width: 100%;
}
</style>
