/**
 * Unit tests for the notifications (status-rail) store.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useNotificationsStore } from "@/stores/notifications";

describe("notifications store", () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useNotificationsStore();
  });

  it("appends notifications in order and returns their ids", () => {
    const a = store.notify({ severity: "info", message: "first" });
    const b = store.notify({ severity: "success", message: "second" });

    expect(store.items.map(n => n.id)).toEqual([a, b]);
    expect(store.items.map(n => n.message)).toEqual(["first", "second"]);
  });

  it("defaults transient severities to auto-dismiss and a duration", () => {
    store.notify({ severity: "success", message: "ok" });
    const item = store.items[0];

    expect(item.persistent).toBe(false);
    expect(item.duration).toBe(4000);
  });

  it("makes warnings and errors sticky by default", () => {
    store.notify({ severity: "error", message: "boom" });
    store.notify({ severity: "warning", message: "careful" });

    expect(store.items[0].persistent).toBe(true);
    expect(store.items[1].persistent).toBe(true);
  });

  it("honours explicit persistent + duration overrides", () => {
    store.notify({ severity: "error", message: "boom", persistent: false, duration: 1000 });
    expect(store.items[0].persistent).toBe(false);
    expect(store.items[0].duration).toBe(1000);
  });

  it("falls back to a severity eyebrow when none is given", () => {
    store.notify({ severity: "warning", message: "careful" });
    expect(store.items[0].eyebrow).toBe("Warning");

    store.notify({ severity: "info", message: "hi", eyebrow: "System" });
    expect(store.items[1].eyebrow).toBe("System");
  });

  it("coerces unknown severities to info", () => {
    store.notify({ severity: "nope", message: "x" });
    expect(store.items[0].severity).toBe("info");
  });

  it("dismisses by id and clears all", () => {
    const a = store.notify({ message: "a" });
    store.notify({ message: "b" });

    store.dismiss(a);
    expect(store.items.map(n => n.message)).toEqual(["b"]);

    store.clear();
    expect(store.items).toEqual([]);
  });
});
