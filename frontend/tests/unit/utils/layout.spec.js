/** Tests for layout utility functions. */

import { describe, it, expect } from "vitest";
import { getLayoutOrder } from "@/utils/layout";

describe("Layout Utilities", () => {
  describe("getLayoutOrder", () => {
    it("should return correct order for landscape with side view on left", () => {
      const order = getLayoutOrder({
        orientation: "landscape",
        sideViewPosition: "left",
        showVerticalBarLeft: true,
        showVerticalBarRight: true,
        showVerticalBarBetween: false,
        showHorizontalBarBetween: false,
      });

      expect(order).toEqual(["verticalBarLeft", "secondary", "calendar", "verticalBarRight"]);
    });

    it("should return correct order for landscape with side view on right", () => {
      const order = getLayoutOrder({
        orientation: "landscape",
        sideViewPosition: "right",
        showVerticalBarLeft: true,
        showVerticalBarRight: true,
        showVerticalBarBetween: false,
        showHorizontalBarBetween: false,
      });

      expect(order).toEqual(["verticalBarLeft", "calendar", "secondary", "verticalBarRight"]);
    });

    it("should return correct order for portrait with side view on top", () => {
      const order = getLayoutOrder({
        orientation: "portrait",
        sideViewPosition: "top",
        showVerticalBarLeft: false,
        showVerticalBarRight: false,
        showVerticalBarBetween: false,
        showHorizontalBarBetween: true,
      });

      expect(order).toEqual(["secondary", "horizontalBarBetween", "calendar"]);
    });

    it("should return correct order for portrait with side view on bottom", () => {
      const order = getLayoutOrder({
        orientation: "portrait",
        sideViewPosition: "bottom",
        showVerticalBarLeft: false,
        showVerticalBarRight: false,
        showVerticalBarBetween: false,
        showHorizontalBarBetween: true,
      });

      expect(order).toEqual(["calendar", "horizontalBarBetween", "secondary"]);
    });

    it("should include vertical bar between in landscape", () => {
      const order = getLayoutOrder({
        orientation: "landscape",
        sideViewPosition: "left",
        showVerticalBarLeft: true,
        showVerticalBarRight: true,
        showVerticalBarBetween: true,
        showHorizontalBarBetween: false,
      });

      expect(order).toEqual([
        "verticalBarLeft",
        "secondary",
        "verticalBarBetween",
        "calendar",
        "verticalBarRight",
      ]);
    });

    it("should not include bars that are not shown", () => {
      const order = getLayoutOrder({
        orientation: "landscape",
        sideViewPosition: "right",
        showVerticalBarLeft: false,
        showVerticalBarRight: false,
        showVerticalBarBetween: false,
        showHorizontalBarBetween: false,
      });

      expect(order).toEqual(["calendar", "secondary"]);
    });
  });
});
