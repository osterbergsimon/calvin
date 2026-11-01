import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FieldTable from "@/components/ui/FieldTable.vue";

const columns = [
  { label: "" },
  { label: "On", width: "7rem" },
  { label: "Off", width: "7rem" },
  { label: "" },
];

const rows = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
];

const mountTable = () =>
  mount(FieldTable, {
    props: { columns, rows },
    slots: {
      default: `<template #default="{ row }"><span class="cell">on {{ row.label }}</span><span class="cell">off</span><span class="cell">switch</span></template>`,
    },
  });

describe("FieldTable", () => {
  it("renders one header row and a row per entry", () => {
    const wrapper = mountTable();
    expect(wrapper.findAll("[data-test='field-table-head']")).toHaveLength(1);
    expect(wrapper.findAll(".field-table__header").map(el => el.text())).toEqual([
      "",
      "On",
      "Off",
      "",
    ]);
    expect(wrapper.findAll(".field-table__row")).toHaveLength(2);
    expect(wrapper.findAll(".field-table__label").map(el => el.text())).toEqual(["Mon", "Tue"]);
  });

  it("puts the header and the row cells on one shared grid", () => {
    const wrapper = mountTable();
    const style = wrapper.find("[data-test='field-table']").attributes("style");
    expect(style).toContain("--field-table-columns: 4.5rem 7rem 7rem minmax(0, 1fr)");
  });

  it("lets the row take a wider label column", () => {
    const wrapper = mount(FieldTable, {
      props: { columns, rows, labelWidth: "6rem" },
      slots: { default: "<span class='cell' />" },
    });
    expect(wrapper.find("[data-test='field-table']").attributes("style")).toContain("6rem");
  });

  it("renders no header when the table has no columns", () => {
    const wrapper = mount(FieldTable, {
      props: { rows },
      slots: { default: "<span class='cell' />" },
    });
    expect(wrapper.find("[data-test='field-table-head']").exists()).toBe(false);
  });
});
