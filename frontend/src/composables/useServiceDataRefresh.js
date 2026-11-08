import { useQueryClient } from "@tanstack/vue-query";
import { useWebServicesStore } from "@/stores/webServices";

/**
 * "Refresh now" for a service widget: reload the service list AND refetch the
 * widget's own data (its `["plugin-data", id]` query, which the list refresh
 * does not touch). Pass the service id to refetch one widget, or nothing to
 * refetch every widget's data.
 *
 * Call from setup(). Outside an app with vue-query (a bare unit test) there is
 * no client to refetch, so only the service list is refreshed.
 */
export function useServiceDataRefresh() {
  const webServicesStore = useWebServicesStore();
  let queryClient = null;
  try {
    queryClient = useQueryClient();
  } catch {
    queryClient = null;
  }
  return async serviceId => {
    await webServicesStore.refreshCurrentService();
    if (!queryClient) return;
    await queryClient.refetchQueries({
      queryKey: serviceId ? ["plugin-data", serviceId] : ["plugin-data"],
    });
  };
}
