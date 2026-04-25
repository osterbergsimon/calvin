/**
 * Unit tests for ConfirmModal component
 * Tests functionality: modal visibility, confirm/cancel actions, content display
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";

describe("ConfirmModal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("Visibility", () => {
    it("should not render when show is false", () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: false,
          message: "Test message",
        },
      });

      expect(wrapper.find(".modal-overlay").exists()).toBe(false);
    });

    it("should render when show is true", () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Test message",
        },
      });

      expect(wrapper.find(".modal-overlay").exists()).toBe(true);
      expect(wrapper.find(".modal-content").exists()).toBe(true);
    });
  });

  describe("Content Display", () => {
    it("should display default title", () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Test message",
        },
      });

      expect(wrapper.find("h3").text()).toBe("Confirm Action");
    });

    it("should display custom title", () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          title: "Delete Item",
          message: "Test message",
        },
      });

      expect(wrapper.find("h3").text()).toBe("Delete Item");
    });

    it("should display message", () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Are you sure you want to delete this item?",
        },
      });

      expect(wrapper.find(".modal-body p").text()).toBe(
        "Are you sure you want to delete this item?"
      );
    });

    it("should display default confirm button text", () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Test message",
        },
      });

      const confirmButton = wrapper.find(".btn-danger");
      expect(confirmButton.text()).toBe("Confirm");
    });

    it("should display custom confirm button text", () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Test message",
          confirmText: "Delete",
        },
      });

      const confirmButton = wrapper.find(".btn-danger");
      expect(confirmButton.text()).toBe("Delete");
    });
  });

  describe("User Interactions", () => {
    it("should emit confirm event when confirm button is clicked", async () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Test message",
        },
      });

      const confirmButton = wrapper.find(".btn-danger");
      await confirmButton.trigger("click");

      expect(wrapper.emitted("confirm")).toBeTruthy();
      expect(wrapper.emitted("confirm")).toHaveLength(1);
    });

    it("should emit cancel event when cancel button is clicked", async () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Test message",
        },
      });

      const cancelButton = wrapper.find(".btn-secondary");
      await cancelButton.trigger("click");

      expect(wrapper.emitted("cancel")).toBeTruthy();
      expect(wrapper.emitted("cancel")).toHaveLength(1);
    });

    it("should emit cancel event when close button is clicked", async () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Test message",
        },
      });

      const closeButton = wrapper.find(".btn-close-modal");
      await closeButton.trigger("click");

      expect(wrapper.emitted("cancel")).toBeTruthy();
      expect(wrapper.emitted("cancel")).toHaveLength(1);
    });

    it("should emit cancel event when overlay is clicked", async () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Test message",
        },
      });

      const overlay = wrapper.find(".modal-overlay");
      await overlay.trigger("click");

      expect(wrapper.emitted("cancel")).toBeTruthy();
      expect(wrapper.emitted("cancel")).toHaveLength(1);
    });

    it("should not emit cancel when modal content is clicked", async () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Test message",
        },
      });

      const modalContent = wrapper.find(".modal-content");
      await modalContent.trigger("click");

      // Should not emit cancel when clicking the modal content itself
      expect(wrapper.emitted("cancel")).toBeFalsy();
    });
  });

  describe("Button Styling", () => {
    it("should have correct classes for buttons", () => {
      const wrapper = mount(ConfirmModal, {
        props: {
          show: true,
          message: "Test message",
        },
      });

      const cancelButton = wrapper.find(".btn-secondary");
      const confirmButton = wrapper.find(".btn-danger");

      expect(cancelButton.exists()).toBe(true);
      expect(confirmButton.exists()).toBe(true);
      expect(cancelButton.classes()).toContain("btn-secondary");
      expect(confirmButton.classes()).toContain("btn-danger");
    });
  });
});
