import { ref } from "vue";

/**
 * A one-shot request to open Pages & regions with a region already selected.
 *
 * Content's "Where it shows" lines live in another Settings category; a
 * module-level ref carries the page + region across the category remount
 * without storing anything durable.
 */
const regionRequest = ref(null);

export function useRegionEditorRequest() {
  const openRegion = (pageId, regionId) => {
    regionRequest.value = { pageId, regionId };
  };
  const clearRegionRequest = () => {
    regionRequest.value = null;
  };
  return { regionRequest, openRegion, clearRegionRequest };
}
