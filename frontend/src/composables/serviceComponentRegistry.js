/**
 * Component registry for service viewers.
 * 
 * Plugins can register their own components by specifying a component_name
 * in their display_schema. Components should be registered here.
 */

// Built-in generic components
import IframeViewer from "../components/service/IframeViewer.vue";
import WeatherViewer from "../components/service/WeatherViewer.vue";
import GenericApiViewer from "../components/service/GenericApiViewer.vue";

/**
 * Registry of service viewer components.
 * 
 * Plugins can register custom components by adding them here.
 * The key should match the component_name in the plugin's display_schema.
 * 
 * Note: Plugin-specific components (like MealPlanViewer) are loaded dynamically
 * via usePluginComponent composable and should not be registered here.
 */
export const serviceComponentRegistry = {
  // Built-in generic viewers only
  iframe: IframeViewer,
  weather: WeatherViewer,
  generic_api: GenericApiViewer,
};

/**
 * Register a custom service viewer component.
 * 
 * @param {string} name - Component name (must match display_schema.component_name)
 * @param {Component} component - Vue component
 */
export function registerServiceComponent(name, component) {
  serviceComponentRegistry[name] = component;
  console.log(`[ServiceComponentRegistry] Registered component: ${name}`);
}

/**
 * Get a service viewer component by name.
 * 
 * @param {string} name - Component name
 * @returns {Component|null} Vue component or null if not found
 */
export function getServiceComponent(name) {
  return serviceComponentRegistry[name] || null;
}

