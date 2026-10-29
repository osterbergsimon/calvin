/**
 * API service for calendar-related operations.
 */

import api from "./api";

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
