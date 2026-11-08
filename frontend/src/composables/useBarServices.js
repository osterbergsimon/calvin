import { onMounted } from "vue";
import { useWebServicesStore } from "../stores/webServices";
import { useProgressStore } from "../stores/progress";

/**
 * Load the plugin instances once when a clock bar mounts.
 *
 * Tiles come from the resolved design, which reads the services store; the
 * chip that used to fetch (PluginStatusbarItems) now mounts only after a tile
 * exists, so the bar itself has to ask. Clock-bar plugins belong to no region:
 * the app frame lights up (CLV-115).
 */
export function useBarServices() {
  const webServicesStore = useWebServicesStore();
  const progressStore = useProgressStore();
  onMounted(() => {
    if (webServicesStore.services.length === 0) {
      progressStore.track("plugin:statusbar", () => webServicesStore.fetchServices());
    }
  });
}
