// Which collapsible settings sections are open.
//
// A section that search can land in (System › Advanced) must be able to open
// itself when a search result or a ?setting= deep link targets it, from code
// that lives outside the section component. One reactive store keeps that
// state addressable by section id.

import { reactive } from "vue";

const openSections = reactive(new Set());

export const isSettingsSectionExpanded = id => openSections.has(id);

export function expandSettingsSection(id) {
  if (id) openSections.add(id);
}

export function collapseSettingsSection(id) {
  openSections.delete(id);
}
