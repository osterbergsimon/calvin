/**
 * Doctrine lint allowlists for UI (docs/design/frontend-doctrine.md §7).
 *
 * One file per area so parallel migration PRs don't conflict: a migration
 * removes its files here and leaves the other areas untouched.
 */

export const roleLint = {
  allowlist: [
    "components/ui/ChipMultiSelect.vue",
    "components/ui/FocusPanel.vue",
    "components/ui/IconButton.vue",
    "components/ui/NumberStepper.vue",
    "components/ui/OnScreenKeyboard.vue",
    "components/ui/PasswordField.vue",
    "components/ui/PhoneSetupCard.vue",
    "components/ui/RangeSlider.vue",
    "components/ui/ScreenDots.vue",
    "components/ui/SegmentedControl.vue",
    "components/ui/SelectPill.vue",
    "components/ui/Tag.vue",
  ],
  baseline: [
    "components/ui/ChipMultiSelect.vue",
    "components/ui/EmptyState.vue",
    "components/ui/FocusPanel.vue",
    "components/ui/IconButton.vue",
    "components/ui/NumberStepper.vue",
    "components/ui/OnScreenKeyboard.vue",
    "components/ui/PasswordField.vue",
    "components/ui/PhoneSetupCard.vue",
    "components/ui/RangeSlider.vue",
    "components/ui/ScreenDots.vue",
    "components/ui/SegmentedControl.vue",
    "components/ui/SelectPill.vue",
    "components/ui/Tag.vue",
    "components/ui/ToggleSwitch.vue",
  ],
};

export const controlLint = {
  allowlist: [],
  baseline: [],
};

export const settingsNoStyle = {
  allowlist: [],
  baseline: [],
};
