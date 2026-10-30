/**
 * Auto events per day (CLV-49).
 *
 * The region no longer inherits a household-wide row count: Auto fits as many
 * event rows as the measured day cell allows, using the rendered chip's height.
 */

/** Fallback when no chip has rendered yet (the CSS chip is ~20px tall). */
export const DEFAULT_EVENT_ROW_HEIGHT = 20;

/**
 * @param {number} cellHeight measured height available for event rows
 * @param {number} [rowHeight] measured height of one rendered chip
 * @returns {number} at least 1
 */
export function autoVisibleEventCount(cellHeight, rowHeight = DEFAULT_EVENT_ROW_HEIGHT) {
  const height = Number(cellHeight);
  const row = Number(rowHeight) > 0 ? Number(rowHeight) : DEFAULT_EVENT_ROW_HEIGHT;
  if (!(height > 0)) return 1;
  return Math.max(1, Math.floor(height / row));
}
