<template>
  <div class="web-service-viewer" :class="{ fullscreen: isFullscreen }">
    <!-- Fullscreen Close Button (only in fullscreen mode) -->
    <div v-if="isFullscreen" class="fullscreen-close-overlay">
      <button
        class="btn-close-fullscreen"
        title="Close Fullscreen (ESC)"
        @click="close"
      >
        ×
      </button>
    </div>

    <!-- Header (hidden in fullscreen mode) -->
    <div v-if="showHeader && !isFullscreen" class="viewer-header">
      <div class="header-left">
        <h2>{{ currentService?.name || "Web Services" }}</h2>
        <div v-if="services.length > 1" class="service-indicator">
          Service {{ currentServiceIndex + 1 }} of {{ services.length }}
        </div>
      </div>
      <div class="header-right">
        <button
          v-if="services.length > 1"
          class="btn-nav"
          title="Previous Service"
          @click="previousService"
        >
          ‹
        </button>
        <button
          v-if="services.length > 1"
          class="btn-nav"
          title="Next Service"
          @click="nextService"
        >
          ›
        </button>
        <button
          class="btn-fullscreen"
          :title="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'"
          @click="toggleFullscreen"
        >
          {{ isFullscreen ? "⤓" : "⤢" }}
        </button>
        <button class="btn-close" title="Close" @click="close">×</button>
      </div>
    </div>

    <!-- Service Selection (if multiple services) -->
    <div
      v-if="showHeader && !isFullscreen && services.length > 1"
      class="service-selector"
    >
      <button
        v-for="(service, index) in services"
        :key="service.id"
        class="service-btn"
        :class="{ active: index === currentServiceIndex }"
        @click="setServiceIndex(index)"
      >
        {{ service.name }}
      </button>
    </div>

    <!-- Viewer Content -->
    <div class="viewer-content">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="spinner" />
        <p>Loading service...</p>
      </div>

      <!-- No Services -->
      <div v-else-if="services.length === 0" class="no-services">
        <p>No web services configured</p>
        <p class="help-text">Add web services in Settings</p>
      </div>

      <!-- API-based Service (e.g., Mealie) -->
      <div v-else-if="currentService && getServiceDisplayType(currentService) === 'api'" class="service-container api-service-container">
        <div v-if="mealPlanLoading" class="loading-state">
          <div class="spinner" />
          <p>Loading service data...</p>
        </div>
        <div v-else-if="mealPlanError" class="error-state">
          <h3>⚠️ Error Loading Service Data</h3>
          <p>{{ mealPlanError }}</p>
          <button class="btn-retry" @click="loadServiceData">Retry</button>
        </div>
        <div v-else-if="mealPlanData" class="service-data-content">
          <!-- Render based on display_schema render_template -->
          <div v-if="currentService.display_schema?.render_template === 'meal_plan'" class="meal-plan-content" :class="`card-size-${mealPlanCardSize}`">
            <div class="meal-plan-header">
              <h3>Meal Plan</h3>
              <span class="meal-plan-dates" v-if="getMealPlanDateRange()">
                {{ getMealPlanDateRange() }}
              </span>
            </div>
            <div v-if="getMealPlanItems().length > 0" class="meal-plan-items">
              <div
                v-for="item in getMealPlanItems()"
                :key="item.id || item.date"
                class="meal-plan-item"
              >
                <div class="meal-plan-date" v-if="item.date">{{ formatDate(item.date) }}</div>
                <div class="meal-plan-meals" v-if="item.meals && item.meals.length > 0">
                  <div 
                    v-for="meal in item.meals" 
                    :key="meal.id || `${item.date}-${meal.type}`" 
                    class="meal-item"
                    :class="{ 'clickable': getRecipeUrl(meal) }"
                    @click="openRecipe(meal)"
                  >
                    <span class="meal-type">{{ formatMealType(meal.type) }}</span>
                    <span class="meal-name">{{ meal.recipeName || meal.recipe?.name || meal.title || 'No recipe' }}</span>
                  </div>
                </div>
                <div v-else class="no-meals-day">
                  <p>No meals planned</p>
                </div>
              </div>
            </div>
            <div v-else class="no-meals">
              <p>No meals planned for this week</p>
            </div>
          </div>
          <!-- Generic API data display (fallback) -->
          <div v-else class="generic-api-content">
            <pre>{{ JSON.stringify(mealPlanData, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- Service Iframe (for non-Mealie services) -->
      <div v-else-if="currentService" class="service-container">
        <iframe
          ref="serviceIframe"
          :src="currentService.url"
          class="service-iframe"
          :class="{ 'iframe-error': iframeError }"
          frameborder="0"
          allowfullscreen
          @load="handleIframeLoad"
          @error="handleIframeError"
        />

        <!-- CORS/Iframe Error Message -->
        <div v-if="iframeError" class="iframe-error-message">
          <div class="error-content">
            <h3>⚠️ Cannot Display Service</h3>
            <p>
              This service cannot be embedded in an iframe due to security
              restrictions (CORS/X-Frame-Options).
            </p>
            <p class="service-url">
              {{ currentService.url }}
            </p>
            <div class="error-actions">
              <a
                :href="currentService.url"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-open-new"
              >
                Open in New Window
              </a>
              <button class="btn-retry" @click="retryLoad">Retry</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from "vue";
import axios from "axios";
import { useConfigStore } from "../stores/config";
import { useWebServicesStore } from "../stores/webServices";
import { useModeStore } from "../stores/mode";

const props = defineProps({
  isFullscreen: {
    type: Boolean,
    default: false,
  },
});

const configStore = useConfigStore();
const webServicesStore = useWebServicesStore();
const modeStore = useModeStore();

const showHeader = computed(() => configStore.showUI);
const mealPlanCardSize = computed(() => configStore.mealPlanCardSize || "medium");
const services = computed(() => webServicesStore.services);
const currentServiceIndex = computed(
  () => webServicesStore.currentServiceIndex,
);
const currentService = computed(() => webServicesStore.getCurrentService());
const loading = computed(() => webServicesStore.loading);

const serviceIframe = ref(null);
const iframeError = ref(false);
const iframeLoadTimeout = ref(null);

// Mealie meal plan state
const mealPlanLoading = ref(false);
const mealPlanError = ref(null);
const mealPlanData = ref(null);

const close = () => {
  if (props.isFullscreen) {
    // Exit fullscreen mode - return to dashboard
    modeStore.exitFullscreen();
  } else {
    // Return to calendar mode (home view)
    modeStore.setMode(modeStore.MODES.CALENDAR);
  }
};

const toggleFullscreen = () => {
  if (props.isFullscreen) {
    // Exit fullscreen - return to dashboard
    modeStore.exitFullscreen();
  } else {
    // Enter fullscreen web services
    modeStore.enterFullscreen(modeStore.MODES.WEB_SERVICES);
  }
};

const nextService = () => {
  webServicesStore.nextService();
  iframeError.value = false;
};

const previousService = () => {
  webServicesStore.previousService();
  iframeError.value = false;
};

const setServiceIndex = (index) => {
  webServicesStore.setServiceIndex(index);
  iframeError.value = false;
  // Load data if it's an API-based service
  if (currentService.value && getServiceDisplayType(currentService.value) === "api") {
    loadServiceData();
  }
};

const getServiceDisplayType = (service) => {
  // Get display type from service's display_schema
  if (service.display_schema && service.display_schema.type) {
    return service.display_schema.type;
  }
  // Fallback: check URL pattern for backward compatibility
  if (service.url && service.url.includes("/api/web-services/") && service.url.includes("/mealplan")) {
    return "api";
  }
  // Default to iframe
  return "iframe";
};

const getServiceApiEndpoint = (service) => {
  // Get API endpoint from display_schema, replacing {service_id} placeholder
  if (service.display_schema && service.display_schema.api_endpoint) {
    return service.display_schema.api_endpoint.replace("{service_id}", service.id);
  }
  // Fallback: use URL directly
  return service.url;
};

const loadServiceData = async () => {
  if (!currentService.value || getServiceDisplayType(currentService.value) !== "api") {
    return;
  }

  mealPlanLoading.value = true;
  mealPlanError.value = null;

  try {
    // Request a full week (7 days) from today
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);
    
    const startDateStr = today.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const endpoint = getServiceApiEndpoint(currentService.value);
    const response = await axios.get(endpoint, {
      params: {
        start_date: startDateStr,
        end_date: endDateStr
      }
    });
    mealPlanData.value = response.data;
    console.log("[Mealie Frontend] Received meal plan data:", mealPlanData.value);
    console.log("[Mealie Frontend] Requested date range:", startDateStr, "to", endDateStr);
    if (mealPlanData.value && mealPlanData.value.items) {
      console.log("[Mealie Frontend] Items count:", mealPlanData.value.items.length);
      if (mealPlanData.value.items.length > 0) {
        console.log("[Mealie Frontend] First item:", mealPlanData.value.items[0]);
      }
    }
  } catch (error) {
    mealPlanError.value = error.response?.data?.detail || error.message || "Failed to load service data";
    console.error("Error loading service data:", error);
  } finally {
    mealPlanLoading.value = false;
  }
};

// Helper functions to handle different Mealie API response structures
const getMealPlanItems = () => {
  if (!mealPlanData.value) return [];
  
  // Get raw items from response
  let rawItems = [];
  
  // Handle paginated response: { items: [...], total: N }
  if (mealPlanData.value.items && Array.isArray(mealPlanData.value.items)) {
    rawItems = mealPlanData.value.items;
  }
  // Handle direct array response: [...]
  else if (Array.isArray(mealPlanData.value)) {
    rawItems = mealPlanData.value;
  }
  // Handle single item: { date: "...", meals: [...] }
  else if (mealPlanData.value.date && mealPlanData.value.meals) {
    return [mealPlanData.value];
  }
  
  if (rawItems.length === 0) return [];
  
  // Mealie API returns individual meal entries, not grouped by day
  // Each item has: date, entryType, title, recipe, etc.
  // We need to group by date and create a structure like:
  // [{ date: "2025-11-10", meals: [{ type: "breakfast", recipe: {...} }] }]
  
  // Group meals by date
  const mealsByDate = {};
  rawItems.forEach(item => {
    const date = item.date;
    if (!date) return;
    
    if (!mealsByDate[date]) {
      mealsByDate[date] = {
        date: date,
        meals: []
      };
    }
    
    // Add meal entry - preserve all recipe data for URL construction
    mealsByDate[date].meals.push({
      id: item.id,
      type: item.entryType || item.type || 'meal',
      title: item.title,
      text: item.text,
      recipe: item.recipe, // Full recipe object (may contain slug, id, etc.)
      recipeId: item.recipeId, // Recipe ID from meal plan entry
      recipeName: item.recipe?.name || item.title || 'No recipe'
    });
  });
  
  // Convert to array and sort by date
  const groupedItems = Object.values(mealsByDate).sort((a, b) => {
    return new Date(a.date) - new Date(b.date);
  });
  
  // Fill in missing days in the week range
  const startDate = getStartDate();
  const endDate = getEndDate();
  const allDays = [];
  
  if (startDate && endDate) {
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const existingDay = groupedItems.find(item => item.date === dateStr);
      
      if (existingDay) {
        allDays.push(existingDay);
      } else {
        // Add empty day
        allDays.push({
          date: dateStr,
          meals: []
        });
      }
      
      current.setDate(current.getDate() + 1);
    }
  } else {
    // If we can't determine the range, just return grouped items
    return groupedItems;
  }
  
  return allDays;
};

const getStartDate = () => {
  if (!mealPlanData.value) return null;
  
  // Try to get from response metadata
  if (mealPlanData.value.start_date) {
    return mealPlanData.value.start_date;
  }
  
  // Calculate from items
  const items = mealPlanData.value.items || (Array.isArray(mealPlanData.value) ? mealPlanData.value : []);
  if (items.length > 0) {
    const dates = items.map(item => item.date).filter(Boolean).sort();
    if (dates.length > 0) {
      return dates[0];
    }
  }
  
  // Default to today
  return new Date().toISOString().split('T')[0];
};

const getEndDate = () => {
  if (!mealPlanData.value) return null;
  
  // Try to get from response metadata
  if (mealPlanData.value.end_date) {
    return mealPlanData.value.end_date;
  }
  
  // Calculate from items
  const items = mealPlanData.value.items || (Array.isArray(mealPlanData.value) ? mealPlanData.value : []);
  if (items.length > 0) {
    const dates = items.map(item => item.date).filter(Boolean).sort();
    if (dates.length > 0) {
      return dates[dates.length - 1];
    }
  }
  
  // Default to 7 days from today
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split('T')[0];
};

const getMealPlanDateRange = () => {
  if (!mealPlanData.value) return "";
  
  // Try to get date range from response metadata
  if (mealPlanData.value.start_date && mealPlanData.value.end_date) {
    return formatDateRange(mealPlanData.value.start_date, mealPlanData.value.end_date);
  }
  
  // Calculate from items if available
  const items = getMealPlanItems();
  if (items.length > 0) {
    const dates = items.map(item => item.date).filter(Boolean).sort();
    if (dates.length > 0) {
      return formatDateRange(dates[0], dates[dates.length - 1]);
    }
  }
  
  return "";
};

const formatMealType = (type) => {
  if (!type) return "Meal";
  // Capitalize first letter
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
};

const formatDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const getMealieUrl = () => {
  // Get mealie_url from response metadata
  if (mealPlanData.value && mealPlanData.value._metadata) {
    return mealPlanData.value._metadata.mealie_url;
  }
  return null;
};

const getRecipeUrl = (meal) => {
  if (!meal) return null;
  
  const mealieUrl = getMealieUrl();
  if (!mealieUrl) return null;
  
  // Mealie recipe URLs are: {mealie_url}/g/home/r/{slug}
  // Or: {mealie_url}/g/{group_id}/r/{slug}
  let slug = null;
  
  if (meal.recipe) {
    // Check for slug (most common)
    if (meal.recipe.slug) {
      slug = meal.recipe.slug;
    }
    // Fallback to recipe ID if slug not available
    else if (meal.recipe.id) {
      slug = meal.recipe.id;
    }
  }
  
  // Fallback to recipeId from meal entry
  if (!slug && meal.recipeId) {
    slug = meal.recipeId;
  }
  
  if (!slug) return null;
  
  // Use /g/home/r/{slug} format (home is the default group view)
  return `${mealieUrl}/g/home/r/${slug}`;
};

const openRecipe = (meal) => {
  const url = getRecipeUrl(meal);
  if (url) {
    window.open(url, '_blank');
  }
};

const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return "";
  const start = new Date(startDate);
  const end = new Date(endDate);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
};

const handleIframeLoad = () => {
  // Clear any timeout
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
    iframeLoadTimeout.value = null;
  }

  // Check if iframe actually loaded content
  // Some sites block iframes but still trigger load event
  try {
    // Try to access iframe content (will fail if blocked by CORS)
    const iframe = serviceIframe.value;
    if (iframe && iframe.contentWindow) {
      // If we can access contentWindow, it might be loaded
      // But we can't reliably check content due to CORS
      // So we'll assume it's loaded unless we get an error
      iframeError.value = false;
    }
  } catch (e) {
    // CORS error - can't access iframe content
    // This is expected for cross-origin iframes, not necessarily an error
    console.log("Cannot access iframe content (CORS):", e.message);
  }
};

const handleIframeError = () => {
  iframeError.value = true;
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
    iframeLoadTimeout.value = null;
  }
};

const retryLoad = () => {
  iframeError.value = false;
  if (serviceIframe.value && currentService.value) {
    // Force reload by setting src again
    const url = currentService.value.url;
    serviceIframe.value.src = "";
    setTimeout(() => {
      if (serviceIframe.value) {
        serviceIframe.value.src = url;
      }
    }, 100);
  }
};

// Watch for service changes to reset error state and load meal plan
watch(
  () => currentService.value?.id,
  () => {
    iframeError.value = false;
    mealPlanData.value = null;
    mealPlanError.value = null;
    
    // Load data if it's an API-based service
    if (currentService.value && getServiceDisplayType(currentService.value) === "api") {
      loadServiceData();
    } else {
      // Set a timeout to detect if iframe doesn't load
      if (iframeLoadTimeout.value) {
        clearTimeout(iframeLoadTimeout.value);
      }
      iframeLoadTimeout.value = setTimeout(() => {
        // If iframe hasn't loaded after 5 seconds, show error
        // This is a fallback for services that silently fail
        if (serviceIframe.value) {
          try {
            // Try to check if iframe has content
            const iframe = serviceIframe.value;
            if (
              iframe.contentDocument === null &&
              iframe.contentWindow === null
            ) {
              iframeError.value = true;
            }
          } catch (e) {
            // CORS error is expected, not necessarily a problem
            console.log("Cannot check iframe content (CORS):", e.message);
          }
        }
      }, 5000);
    }
  },
);

// Handle Escape key to close fullscreen
const handleKeydown = (event) => {
  if (event.key === "Escape" && props.isFullscreen) {
    close();
    event.preventDefault();
  }
};

onMounted(async () => {
  await webServicesStore.fetchServices();
  // Load data if current service is API-based
  if (currentService.value && getServiceDisplayType(currentService.value) === "api") {
    loadServiceData();
  }
  // Add keyboard listener for Escape key
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  if (iframeLoadTimeout.value) {
    clearTimeout(iframeLoadTimeout.value);
  }
  // Remove keyboard listener
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<style scoped>
.web-service-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-radius: 8px;
  overflow: hidden;
}

.web-service-viewer.fullscreen {
  border-radius: 0;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
}

.viewer-header {
  padding: 1rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.viewer-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.service-indicator {
  font-size: 0.9rem;
  color: var(--text-secondary);
  padding: 0.25rem 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-nav,
.btn-fullscreen,
.btn-close {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  width: 32px;
  height: 32px;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  transition: all 0.2s;
}

.btn-nav:hover,
.btn-fullscreen:hover,
.btn-close:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.service-selector {
  padding: 0.75rem 1rem;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.service-btn {
  padding: 0.5rem 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary);
}

.service-btn:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.service-btn.active {
  background: var(--accent-primary);
  color: #fff; /* Keep white for contrast on accent background */
  border-color: var(--accent-primary);
}

.viewer-content {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.loading-state,
.no-services {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top: 4px solid var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.help-text {
  font-size: 0.9rem;
  font-style: italic;
}

.service-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.service-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.service-iframe.iframe-error {
  opacity: 0.3;
  pointer-events: none;
}

.iframe-error-message {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-primary);
  opacity: 0.95;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  padding: 2rem;
}

.error-content {
  max-width: 500px;
  text-align: center;
  background: var(--bg-primary);
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--shadow-hover);
}

.error-content h3 {
  margin: 0 0 1rem 0;
  color: var(--accent-error);
  font-size: 1.5rem;
}

.error-content p {
  margin: 0.5rem 0;
  color: var(--text-secondary);
  line-height: 1.6;
}

.service-url {
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--text-tertiary);
  word-break: break-all;
  background: var(--bg-secondary);
  padding: 0.5rem;
  border-radius: 4px;
  margin: 1rem 0;
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1.5rem;
}

.btn-open-new,
.btn-retry {
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
  display: inline-block;
}

.btn-open-new {
  background: var(--accent-secondary);
  color: #fff; /* Keep white for contrast on accent background */
  border: none;
}

.btn-open-new:hover {
  background: var(--accent-secondary);
  opacity: 0.9;
}

.btn-retry {
  background: var(--accent-primary);
  color: #fff; /* Keep white for contrast on accent background */
  border: none;
}

.btn-retry:hover {
  background: var(--accent-primary);
  opacity: 0.9;
}

.fullscreen-close-overlay {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 100;
  pointer-events: none;
}

.btn-close-fullscreen {
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  width: 48px;
  height: 48px;
  font-size: 2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.btn-close-fullscreen:hover {
  background: rgba(0, 0, 0, 0.9);
  border-color: rgba(255, 255, 255, 0.8);
  transform: scale(1.1);
}

/* API-based Service Styles */
.api-service-container {
  padding: 1.5rem;
  overflow-y: auto;
}

.service-data-content {
  width: 100%;
  height: 100%;
}

.meal-plan-content {
  width: 100%;
  height: 100%;
  padding: 2rem;
  overflow-y: auto;
  max-height: 100%;
  background: var(--bg-primary);
}

.meal-plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 2px solid var(--border-color);
}

.meal-plan-header h3 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.meal-plan-dates {
  font-size: 0.95rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.meal-plan-items {
  display: grid;
  gap: 1rem;
}

/* Card size variants */
.meal-plan-content.card-size-small .meal-plan-items {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.meal-plan-content.card-size-medium .meal-plan-items {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.meal-plan-content.card-size-large .meal-plan-items {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

/* Portrait mode: stack cards vertically */
@media (orientation: portrait) {
  .meal-plan-items {
    grid-template-columns: 1fr !important;
    gap: 0.75rem;
  }
  
  .meal-plan-item {
    padding: 1rem;
  }
  
  .meal-plan-header {
    margin-bottom: 1rem;
    padding-bottom: 1rem;
  }
}

/* Smaller screens */
@media (max-width: 768px) {
  .meal-plan-items {
    grid-template-columns: 1fr !important;
    gap: 0.75rem;
  }
}

.meal-plan-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.meal-plan-item:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.meal-plan-date {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-primary);
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meal-plan-meals {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.meal-item {
  display: flex;
  gap: 1rem;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--bg-primary);
  border-radius: 8px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.meal-item.clickable {
  cursor: pointer;
}

.meal-item.clickable:hover {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
  transform: translateX(6px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.meal-item.clickable .meal-name {
  color: var(--accent-primary);
  font-weight: 500;
  transition: all 0.2s ease;
}

.meal-item.clickable:hover .meal-name {
  color: var(--accent-primary);
  font-weight: 600;
}

.meal-type {
  font-weight: 700;
  color: var(--accent-primary);
  min-width: 90px;
  text-transform: capitalize;
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  text-align: center;
}

.meal-name {
  color: var(--text-primary);
  flex: 1;
  font-size: 1rem;
  line-height: 1.5;
}

.no-meals {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-tertiary);
  font-size: 1.1rem;
}

.no-meals-day {
  text-align: center;
  padding: 1rem;
  color: var(--text-tertiary);
  font-style: italic;
  font-size: 0.95rem;
  background: var(--bg-tertiary);
  border-radius: 6px;
  border: 1px dashed var(--border-color);
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}

.error-state h3 {
  margin: 0 0 1rem 0;
  color: var(--accent-error);
}

.error-state p {
  margin: 0 0 1.5rem 0;
  color: var(--text-secondary);
}
</style>
