/**
 * Layout utility functions for positioning elements in flexbox layouts.
 */

/**
 * Get the render order for layout elements.
 * Returns an array of element types in the order they should be rendered.
 * @param {Object} config - Layout configuration
 * @param {string} config.orientation - 'landscape' | 'portrait'
 * @param {string} config.sideViewPosition - 'left' | 'right' | 'top' | 'bottom'
 * @param {boolean} config.showVerticalBarLeft - Whether to show vertical bar on left
 * @param {boolean} config.showVerticalBarRight - Whether to show vertical bar on right
 * @param {boolean} config.showVerticalBarBetween - Whether to show vertical bar between
 * @param {boolean} config.showHorizontalBarBetween - Whether to show horizontal bar between
 * @returns {Array<string>} Array of element types in render order
 */
export function getLayoutOrder(config) {
  const {
    orientation,
    sideViewPosition,
    showVerticalBarLeft,
    showVerticalBarRight,
    showVerticalBarBetween,
    showHorizontalBarBetween,
  } = config;

  const elements = [];

  // Always start with left vertical bar if present
  if (showVerticalBarLeft) {
    elements.push("verticalBarLeft");
  }

  // Determine order of calendar and secondary based on orientation and side view position
  if (orientation === "landscape") {
    // Landscape: left/right positioning
    if (sideViewPosition === "left") {
      // Side view on left, calendar on right
      elements.push("secondary");
      // Between bar goes here if present
      if (showVerticalBarBetween) {
        elements.push("verticalBarBetween");
      }
      elements.push("calendar");
    } else {
      // Side view on right, calendar on left
      elements.push("calendar");
      // Between bar goes here if present
      if (showVerticalBarBetween) {
        elements.push("verticalBarBetween");
      }
      elements.push("secondary");
    }
  } else {
    // Portrait: top/bottom positioning
    if (sideViewPosition === "top") {
      // Side view on top, calendar on bottom
      elements.push("secondary");
      // Between bar goes here if present
      if (showHorizontalBarBetween) {
        elements.push("horizontalBarBetween");
      }
      elements.push("calendar");
    } else {
      // Side view on bottom, calendar on top
      elements.push("calendar");
      // Between bar goes here if present
      if (showHorizontalBarBetween) {
        elements.push("horizontalBarBetween");
      }
      elements.push("secondary");
    }
  }

  // Always end with right vertical bar if present
  if (showVerticalBarRight) {
    elements.push("verticalBarRight");
  }

  return elements;
}
