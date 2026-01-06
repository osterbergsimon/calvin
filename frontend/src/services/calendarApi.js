/**
 * API service for calendar-related operations.
 */

import api from "./api";

/**
 * Get calendar sources.
 */
export async function getCalendarSources() {
  const response = await api.get("/calendar/sources");
  return response.data;
}

/**
 * Add calendar source.
 */
export async function addCalendarSource(source) {
  const response = await api.post("/calendar/sources", source);
  return response.data;
}

/**
 * Delete calendar source.
 */
export async function deleteCalendarSource(sourceId) {
  const response = await api.delete(`/calendar/sources/${sourceId}`);
  return response.data;
}
