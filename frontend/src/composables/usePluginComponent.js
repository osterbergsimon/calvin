/**
 * Composable for dynamically loading plugin-provided frontend components.
 * 
 * Plugins can specify their frontend component in display_schema.component.
 * The component path should be relative to frontend/src/components/plugins/
 * 
 * Example:
 *   display_schema: {
 *     component: "mealie/MealPlanViewer.vue"
 *   }
 */

import { shallowRef, ref, computed, watch, unref, markRaw } from "vue";

// Cache for loaded components (use markRaw to prevent reactivity)
const componentCache = new Map();

/**
 * Dynamically import a plugin component.
 * 
 * @param {string} componentPath - Path relative to components/plugins/
 * @returns {Promise<Component>} Vue component
 */
export async function loadPluginComponent(componentPath) {
  // Check cache first
  if (componentCache.has(componentPath)) {
    return componentCache.get(componentPath);
  }

  try {
    // Dynamic import - Vite will handle this at build time
    const componentModule = await import(
      /* @vite-ignore */
      `../components/plugins/${componentPath}`
    );
    
    const component = componentModule.default || componentModule;
    // Mark component as raw to prevent Vue from making it reactive
    const rawComponent = markRaw(component);
    
    // Cache the component
    componentCache.set(componentPath, rawComponent);
    return rawComponent;
  } catch (error) {
    console.error(`[PluginComponent] Failed to load component: ${componentPath}`, error);
    return null;
  }
}

/**
 * Get component path from service display_schema.
 * 
 * @param {Object} service - Service object with display_schema
 * @returns {string|null} Component path or null
 */
export function getPluginComponentPath(service) {
  if (!service?.display_schema) return null;
  
  // Check for explicit component path
  if (service.display_schema.component) {
    return service.display_schema.component;
  }
  
  // Fallback: try to infer from type_id or render_template
  const typeId = service.type_id || service.id?.split('-')[0];
  const renderTemplate = service.display_schema.render_template;
  
  // If render_template is a known generic template, return null (use generic viewer)
  const genericTemplates = ['weather', 'iframe'];
  if (genericTemplates.includes(renderTemplate)) {
    return null;
  }
  
  // Try to infer component path from type_id
  if (typeId && renderTemplate) {
    // e.g., "mealie" + "meal_plan" -> "mealie/MealPlanViewer.vue"
    const componentName = renderTemplate
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('') + 'Viewer.vue';
    return `${typeId}/${componentName}`;
  }
  
  return null;
}

/**
 * Composable to get a plugin component for a service.
 * 
 * @param {Object|Ref} service - Service object (can be reactive)
 * @returns {Object} { component, loading, error, componentPath, reload }
 */
export function usePluginComponent(service) {
  // Use shallowRef for component to prevent deep reactivity
  const component = shallowRef(null);
  const loading = ref(false);
  const error = ref(null);

  // Handle both reactive and non-reactive service
  const serviceRef = computed(() => {
    if (typeof service === 'function' || (service && 'value' in service)) {
      return unref(service);
    }
    return service;
  });

  const componentPath = computed(() => getPluginComponentPath(serviceRef.value));

  const loadComponent = async () => {
    const path = componentPath.value;
    if (!path) {
      component.value = null;
      loading.value = false;
      return;
    }

    loading.value = true;
    error.value = null;
    component.value = null;

    try {
      const loadedComponent = await loadPluginComponent(path);
      if (loadedComponent) {
        component.value = loadedComponent;
      } else {
        error.value = `Component not found: ${path}`;
      }
    } catch (err) {
      error.value = err.message || String(err);
      console.error(`[PluginComponent] Error loading component for ${serviceRef.value?.id}:`, err);
    } finally {
      loading.value = false;
    }
  };

  // Watch for service changes and load component
  watch(
    [serviceRef, componentPath],
    () => {
      loadComponent();
    },
    { immediate: true }
  );

  return {
    component,
    loading,
    error,
    componentPath,
    reload: loadComponent,
  };
}

