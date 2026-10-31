/**
 * Unit tests for ConfirmModal: a thin wrapper over ui/Dialog.
 * Visibility, wording, confirm/cancel events and the danger vs primary action.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mount, enableAutoUnmount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import ConfirmModal from "@/components/settings/shared/ConfirmModal.vue";
import Dialog from "@/components/ui/Dialog.vue";
import DialogScrim from "@/components/ui/DialogScrim.vue";

enableAutoUnmount(afterEach);

const mountConfirm = props =>
  mount(ConfirmModal, {
    props: { message: "Test message", ...props },
  });

describe("ConfirmModal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("Visibility", () => {
    it("renders nothing while show is false", () => {
      const wrapper = mountConfirm({ show: false });
      expect(wrapper.find("[role='dialog']").exists()).toBe(false);
    });

    it("uses the shared Dialog shell when show is true", () => {
      const wrapper = mountConfirm({ show: true });
      expect(wrapper.findComponent(Dialog).exists()).toBe(true);
      expect(wrapper.find("[role='dialog']").exists()).toBe(true);
      expect(wrapper.findComponent(DialogScrim).exists()).toBe(true);
    });
  });

  describe("Content Display", () => {
    it("displays the default title", () => {
      const wrapper = mountConfirm({ show: true });
      expect(wrapper.find(".dialog__title").text()).toBe("Confirm Action");
    });

    it("displays a custom title", () => {
      const wrapper = mountConfirm({ show: true, title: "Delete Item" });
      expect(wrapper.find(".dialog__title").text()).toBe("Delete Item");
    });

    it("displays the message", () => {
      const wrapper = mountConfirm({
        show: true,
        message: "Are you sure you want to delete this item?",
      });
      expect(wrapper.find(".confirm-modal__message").text()).toBe(
        "Are you sure you want to delete this item?"
      );
    });

    it("displays the default confirm button text", () => {
      const wrapper = mountConfirm({ show: true });
      expect(wrapper.find('[data-test="confirm-accept"]').text()).toBe("Confirm");
    });

    it("displays a custom confirm button text", () => {
      const wrapper = mountConfirm({ show: true, confirmText: "Delete" });
      expect(wrapper.find('[data-test="confirm-accept"]').text()).toBe("Delete");
    });
  });

  describe("User Interactions", () => {
    it("emits confirm when the confirm button is clicked", async () => {
      const wrapper = mountConfirm({ show: true });
      await wrapper.find('[data-test="confirm-accept"]').trigger("click");

      expect(wrapper.emitted("confirm")).toHaveLength(1);
    });

    it("emits cancel when the cancel button is clicked", async () => {
      const wrapper = mountConfirm({ show: true });
      await wrapper.find('[data-test="confirm-cancel"]').trigger("click");

      expect(wrapper.emitted("cancel")).toHaveLength(1);
    });

    it("emits cancel when the Dialog's close button is clicked", async () => {
      const wrapper = mountConfirm({ show: true });
      await wrapper.find("[aria-label='Close']").trigger("click");

      expect(wrapper.emitted("cancel")).toHaveLength(1);
    });

    it("emits cancel when the scrim is dismissed", async () => {
      const wrapper = mountConfirm({ show: true });
      wrapper.findComponent(DialogScrim).vm.$emit("dismiss");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("cancel")).toHaveLength(1);
    });
  });

  describe("Button Styling", () => {
    it("uses the primary Button for a confirm by default", () => {
      const wrapper = mountConfirm({ show: true });
      expect(wrapper.find('[data-test="confirm-cancel"]').classes()).toContain("btn--secondary");
      expect(wrapper.find('[data-test="confirm-accept"]').classes()).toContain("btn--primary");
      expect(wrapper.find('[data-test="confirm-accept"]').classes()).not.toContain("btn--danger");
    });

    it("uses the danger Button only when the action loses something", () => {
      const wrapper = mountConfirm({
        show: true,
        message: "Uninstall Mealie?",
        confirmText: "Uninstall",
        danger: true,
      });

      const confirmButton = wrapper.find('[data-test="confirm-accept"]');
      expect(confirmButton.text()).toBe("Uninstall");
      expect(confirmButton.classes()).toContain("btn--danger");
      expect(confirmButton.classes()).not.toContain("btn--primary");
    });
  });
});
