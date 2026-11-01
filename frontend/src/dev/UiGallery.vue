<template>
  <div
    ref="galleryEl"
    class="ui-gallery"
    :class="{ dark: preset.dark }"
    :style="preset.vars"
    :data-theme="themeName"
    :data-mode="mode"
    data-test="ui-gallery"
  >
    <header class="ui-gallery__bar">
      <h1 class="ui-gallery__title">Calvin UI gallery</h1>
      <div class="ui-gallery__controls">
        <SegmentedControl v-model="themeName" :options="GALLERY_THEME_OPTIONS" aria-label="Theme" />
        <SegmentedControl v-model="mode" :options="GALLERY_MODE_OPTIONS" aria-label="Mode" />
      </div>
    </header>

    <main class="ui-gallery__body">
      <section class="ui-gallery__section" data-test="gallery-button">
        <h2 class="ui-gallery__heading">Button</h2>
        <p class="ui-gallery__note">
          The one text button. Primary is orange (one per view region); secondary is the default.
          Danger is the text tone — fill it only inside a destructive confirm. Link is an inline
          text action. md uses the control height, sm the touch target.
        </p>

        <h3 class="ui-gallery__group">Variants · md</h3>
        <div class="ui-gallery__row">
          <Button variant="primary">Add a source</Button>
          <Button>Cancel</Button>
          <Button variant="ghost">Not now</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="link">Where to find it</Button>
        </div>

        <h3 class="ui-gallery__group">Variants · sm</h3>
        <div class="ui-gallery__row">
          <Button variant="primary" size="sm">Install</Button>
          <Button size="sm">Test connection</Button>
          <Button variant="ghost" size="sm">Not now</Button>
          <Button variant="danger" size="sm">Remove</Button>
          <Button variant="link" size="sm">See details in Plugins ›</Button>
        </div>

        <h3 class="ui-gallery__group">States</h3>
        <div class="ui-gallery__row">
          <Button variant="primary" disabled>Can't add yet</Button>
          <Button disabled>Disabled</Button>
          <Button variant="primary" loading loading-label="Saving…">Save</Button>
          <Button loading loading-label="Testing…">Test connection</Button>
        </div>

        <h3 class="ui-gallery__group">Icon</h3>
        <div class="ui-gallery__row">
          <Button variant="primary" :icon="mdiCheck">Added</Button>
          <Button :icon="mdiRefresh">Try again</Button>
          <Button variant="primary" icon-only :icon="mdiCheck" label="Mark added" />
          <Button icon-only :icon="mdiRefresh" label="Try again" />
        </div>
      </section>

      <section class="ui-gallery__section" data-test="gallery-text-field">
        <h2 class="ui-gallery__heading">TextField</h2>
        <p class="ui-gallery__note">
          One text input: label, 48px box, hint or error line. Secrets use PasswordField, numbers
          use NumberStepper. The focused field below shows the focus ring.
        </p>

        <h3 class="ui-gallery__group">States</h3>
        <div class="ui-gallery__grid">
          <TextField v-model="text" label="Display name" placeholder="Kitchen" />
          <TextField
            v-model="text"
            label="Calendar address"
            hint="The full webcal address from your provider."
          />
          <TextField
            v-model="text"
            label="Calendar address"
            error="That address didn't respond."
            data-test="gallery-text-field-focus"
          />
          <TextField v-model="text" label="Display name" disabled />
        </div>
      </section>

      <section class="ui-gallery__section" data-test="gallery-inline-note">
        <h2 class="ui-gallery__heading">InlineNote</h2>
        <p class="ui-gallery__note">
          The one-line note under a row: a hint, a warning, an error or a confirmation. Status is
          never colour alone — ok, warn and err add a decorative icon and the word carries the
          meaning; neutral stays iconless. An action can sit on the same line.
        </p>

        <div class="ui-gallery__stack">
          <InlineNote>Synced just now.</InlineNote>
          <InlineNote tone="ok">All three sources are working.</InlineNote>
          <InlineNote tone="warn">Changes take effect after a restart.</InlineNote>
          <InlineNote tone="err">That address didn't respond.</InlineNote>
          <InlineNote tone="warn">
            This screen has no content yet.
            <template #action><Button variant="link" size="sm">Choose content</Button></template>
          </InlineNote>
        </div>
      </section>

      <section class="ui-gallery__section" data-test="gallery-card">
        <h2 class="ui-gallery__heading">Card</h2>
        <p class="ui-gallery__note">
          A raised surface inside a page or another card, at the card radius. It carries a title and
          one action at most; panels and list rows have their own blocks.
        </p>

        <div class="ui-gallery__grid">
          <Card title="Connection">
            <template #action><Button size="sm">Refresh</Button></template>
            <InlineNote tone="ok">Connected to the plugin repository.</InlineNote>
          </Card>
          <Card>
            <p class="ui-gallery__text">
              A plain card for content that needs its own surface, with no heading of its own.
            </p>
          </Card>
        </div>
      </section>

      <section class="ui-gallery__section" data-test="gallery-progress-bar">
        <h2 class="ui-gallery__heading">ProgressBar</h2>
        <p class="ui-gallery__note">
          Progress of a long task, such as a guest's upload. The fill is the action colour; the "3
          of 8" text sits beside it and is the only thing announced.
        </p>

        <div class="ui-gallery__stack">
          <span class="ui-gallery__text">Sending 3 of 8</span>
          <ProgressBar :value="40" label="Upload progress" value-text="Sending 3 of 8" />
        </div>
      </section>

      <section class="ui-gallery__section" data-test="gallery-list-row">
        <h2 class="ui-gallery__heading">ListRow</h2>
        <p class="ui-gallery__note">
          Lead · body · actions for every list (sources, screens, keys, plugins). The actions group
          stays on one line; under 600px it moves under the body as one right-aligned line.
        </p>

        <div class="ui-gallery__stack">
          <ListRow
            :lead="mdiCalendar"
            name="Family calendar"
            :meta="['CalDAV · 12 events', 'Synced just now']"
          >
            <template #actions>
              <Button size="sm">Edit</Button>
              <Button
                size="sm"
                icon-only
                :icon="mdiDotsHorizontal"
                label="More actions for Family calendar"
              />
            </template>
          </ListRow>
          <ListRow
            :lead="mdiImage"
            name="Photo album"
            :meta="['Local folder · 214 photos', { text: 'Last sync failed', tone: 'err' }]"
            selected
          >
            <template #actions>
              <Button size="sm">Edit</Button>
            </template>
          </ListRow>
          <ListRow :lead="mdiMonitor" name="Hallway screen" :meta="['Kiosk · offline']" disabled>
            <template #actions>
              <Button size="sm" disabled>Edit</Button>
            </template>
          </ListRow>
        </div>
      </section>

      <section class="ui-gallery__section" data-test="gallery-popover">
        <h2 class="ui-gallery__heading">Popover and Menu</h2>
        <p class="ui-gallery__note">
          The one small floating surface: anchored to its trigger, flipping above when the viewport
          runs out below, closed by Escape or an outside tap, with focus returned to the opener. It
          stays clear of the on-screen keyboard. A Menu on top is the action list: arrow keys move,
          Home and End jump, and a destructive item sorts last.
        </p>

        <h3 class="ui-gallery__group">Menu</h3>
        <div class="ui-gallery__row">
          <Popover
            :model-value="menuOpen"
            label="More actions for Family calendar"
            haspopup="menu"
            @update:model-value="menuOpen = $event"
          >
            <template #trigger="{ attrs }">
              <IconButton
                v-bind="attrs"
                size="md"
                variant="ghost"
                label="More actions for Family calendar"
                data-test="gallery-menu-trigger"
              >
                <svg class="ui-gallery__glyph" viewBox="0 0 24 24" aria-hidden="true">
                  <path :d="mdiDotsHorizontal" fill="currentColor" />
                </svg>
              </IconButton>
            </template>
            <Menu
              :items="galleryMenuItems"
              label="More actions for Family calendar"
              @select="onMenuSelect"
              @close="menuOpen = false"
            />
          </Popover>
          <span class="ui-gallery__text" aria-live="polite">{{ menuNote }}</span>
        </div>

        <h3 class="ui-gallery__group">Explainer</h3>
        <div class="ui-gallery__row">
          <Popover v-model="infoOpen" label="About the connection" role="dialog" haspopup="dialog">
            <template #trigger="{ attrs }">
              <Button v-bind="attrs" data-test="gallery-popover-trigger">
                Connection details
              </Button>
            </template>
            <div class="ui-gallery__popover-body">
              <p class="ui-gallery__text">
                Calvin checks the plugin repository every hour. A failed check keeps the last
                working copy and shows a warning in Settings.
              </p>
              <InlineNote tone="ok">Last checked just now.</InlineNote>
            </div>
          </Popover>
        </div>
      </section>

      <section class="ui-gallery__section" data-test="gallery-colour-field">
        <h2 class="ui-gallery__heading">ColourField</h2>
        <p class="ui-gallery__note">
          The theme's eight event colours first, as a radio group, then Custom… opening the native
          picker. It shows the chosen swatch and its name; there is no raw hex box. In a list row
          the compact form shows the same picker in a Popover.
        </p>

        <div class="ui-gallery__grid">
          <ColourField
            v-model="themeColour"
            label="Calendar colour"
            hint="These eight follow the theme."
          />
          <ColourField
            v-model="customColour"
            label="Custom calendar colour"
            hint="A colour outside the theme is kept as a custom value."
          />
          <ColourField v-model="rowColour" label="Colour for Family calendar" compact />
        </div>
      </section>

      <section class="ui-gallery__section" data-test="gallery-field-table">
        <h2 class="ui-gallery__heading">FieldTable</h2>
        <p class="ui-gallery__note">
          A compact “same fields per row” editor: one header row, then a label and its controls per
          row. Rows are the touch target tall, the cells sit --gap-inline apart, and under 360px the
          label stacks above its controls. The screen schedule is its first user.
        </p>

        <SettingsSection id="gallery-field-table-schedule" title="Schedule">
          <FieldTable :columns="fieldTableColumns" :rows="fieldTableRows">
            <template #default="{ row }">
              <TextField
                type="time"
                step="900"
                hide-label
                :label="`${row.label} on`"
                :model-value="row.onTime"
                @update:model-value="value => (row.onTime = value)"
              />
              <TextField
                type="time"
                step="900"
                hide-label
                :label="`${row.label} off`"
                :model-value="row.offTime"
                @update:model-value="value => (row.offTime = value)"
              />
              <ToggleSwitch
                :model-value="row.enabled"
                :aria-label="`Screen on, ${row.label}`"
                @update:model-value="value => (row.enabled = value)"
              />
            </template>
          </FieldTable>
        </SettingsSection>
      </section>

      <section class="ui-gallery__section" data-test="gallery-setting-group">
        <h2 class="ui-gallery__heading">SettingGroup</h2>
        <p class="ui-gallery__note">
          A sub-heading inside a settings panel, in sentence case at the label role. It replaces the
          uppercase labels that used to be hand-written inside individual cards.
        </p>

        <SettingsSection id="gallery-notifications" title="Notifications">
          <SettingGroup title="Email">
            <SettingRow label="Daily summary" description="One email each morning.">
              <ToggleSwitch :model-value="true" aria-label="Daily summary" />
            </SettingRow>
            <SettingRow label="Warnings" description="Only when a source stops working.">
              <ToggleSwitch :model-value="false" aria-label="Warnings" />
            </SettingRow>
          </SettingGroup>
          <SettingGroup title="Quiet hours">
            <SettingRow label="Start" description="No emails after this time." stacked>
              <Button size="sm">22:00</Button>
            </SettingRow>
          </SettingGroup>
        </SettingsSection>
      </section>

      <section class="ui-gallery__section" data-test="gallery-scope-line">
        <h2 class="ui-gallery__heading">ScopeLine</h2>
        <p class="ui-gallery__note">
          Where a row's value comes from: “Same as Default” when it inherits, “Changed here” plus a
          way back when this screen has its own override. It sits in SettingRow's description.
        </p>

        <SettingsSection id="gallery-scope" title="This screen">
          <SettingRow label="Clock format">
            <template #description><ScopeLine /></template>
            <Button size="sm">24-hour</Button>
          </SettingRow>
          <SettingRow label="Clock size">
            <template #description>
              <ScopeLine :overridden="scopeOverridden" @reset="scopeOverridden = false" />
            </template>
            <Button size="sm">Large</Button>
          </SettingRow>
        </SettingsSection>
      </section>

      <section class="ui-gallery__section" data-test="gallery-tabs">
        <h2 class="ui-gallery__heading">Tabs</h2>
        <p class="ui-gallery__note">
          Navigation between views of the same thing: an ARIA tablist with one line per tab, a 2px
          underline on the active tab and a roving tabindex. Arrow keys, Home and End move; the row
          scrolls sideways with edge fades. Choosing a value stays a SegmentedControl.
        </p>

        <Tabs v-model="galleryTab" :items="galleryTabs" aria-label="Gallery pages">
          <template #action>
            <Button variant="ghost" size="sm" :icon="mdiPlus">Page</Button>
          </template>
        </Tabs>
      </section>

      <section class="ui-gallery__section" data-test="gallery-dialog">
        <h2 class="ui-gallery__heading">Dialog</h2>
        <p class="ui-gallery__note">
          The one dialog shell: scrim, title, body, actions, focus trap, Escape, focus returned to
          the opener, and above the on-screen keyboard. A destructive confirm fills its danger
          button; everything else uses one primary.
        </p>

        <div class="ui-gallery__row">
          <Button variant="primary" data-test="open-dialog" @click="openDialog('form')">
            Open dialog
          </Button>
          <Button variant="danger" data-test="open-confirm" @click="openDialog('confirm')">
            Open destructive confirm
          </Button>
          <Button variant="secondary" data-test="open-full-dialog" @click="fullDialogOpen = true">
            Open full sheet
          </Button>
        </div>
      </section>
    </main>

    <Dialog
      v-model="dialogOpen"
      :title="dialogMode === 'confirm' ? 'Remove this source?' : 'Add a calendar'"
      :wide="false"
    >
      <template v-if="dialogMode === 'confirm'">
        <p class="ui-gallery__text">
          “Family calendar” will stop appearing on every screen. You can add it again from Content ›
          Calendars.
        </p>
      </template>
      <template v-else>
        <div class="ui-gallery__stack">
          <TextField
            v-model="dialogText"
            label="Calendar address"
            placeholder="https://…"
            hint="The full webcal address from your provider."
          />
          <InlineNote tone="warn">Calvin will ask the provider before saving.</InlineNote>
        </div>
      </template>
      <template #actions>
        <Button @click="dialogOpen = false">Cancel</Button>
        <Button
          v-if="dialogMode === 'confirm'"
          variant="danger"
          data-test="dialog-confirm"
          @click="dialogOpen = false"
        >
          Remove
        </Button>
        <Button v-else variant="primary" data-test="dialog-save" @click="dialogOpen = false">
          Add calendar
        </Button>
      </template>
    </Dialog>

    <Dialog
      v-model="fullDialogOpen"
      size="full"
      title="Pages & regions"
      close-label="Close editor"
      scrim-blur
    >
      <template #subtitle>Design the pages your screens display · changes apply live</template>
      <div class="ui-gallery__full-sheet">
        <p class="ui-gallery__text">
          The full size keeps the page gutter on a roomy screen and bleeds edge-to-edge when the
          editor measures itself as compact or phone. Escape, the focus trap and the on-screen
          keyboard layer are the same as every other dialog.
        </p>
        <TextField v-model="fullDialogText" label="Page name" hint="Shown on the page tabs." />
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  mdiCalendar,
  mdiCheck,
  mdiDotsHorizontal,
  mdiImage,
  mdiMonitor,
  mdiPlus,
  mdiRefresh,
} from "@mdi/js";
import { GALLERY_MODE_OPTIONS, GALLERY_THEME_OPTIONS, galleryTheme } from "./galleryThemes.js";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import ColourField from "../components/ui/ColourField.vue";
import Dialog from "../components/ui/Dialog.vue";
import FieldTable from "../components/ui/FieldTable.vue";
import IconButton from "../components/ui/IconButton.vue";
import InlineNote from "../components/ui/InlineNote.vue";
import ListRow from "../components/ui/ListRow.vue";
import Menu from "../components/ui/Menu.vue";
import Popover from "../components/ui/Popover.vue";
import ProgressBar from "../components/ui/ProgressBar.vue";
import ScopeLine from "../components/ui/ScopeLine.vue";
import SegmentedControl from "../components/ui/SegmentedControl.vue";
import SettingGroup from "../components/ui/SettingGroup.vue";
import Tabs from "../components/ui/Tabs.vue";
import TextField from "../components/ui/TextField.vue";
import ToggleSwitch from "../components/ui/ToggleSwitch.vue";
import { eventSwatches } from "../utils/themePalettes";
import SettingRow from "../components/settings/shell/SettingRow.vue";
import SettingsSection from "../components/settings/shell/SettingsSection.vue";

// ?theme=calvin|ocean|forest|sunset&mode=light|dark makes a review link
// deterministic. The snapshot suite keeps the legacy ?theme=light|dark (Calvin)
// so the CI baselines stay on the default palette.
const params = new URLSearchParams(window.location.search);
const requestedTheme = params.get("theme");
const requestedMode = params.get("mode");
const themeName = ref(
  GALLERY_THEME_OPTIONS.some(option => option.value === requestedTheme) ? requestedTheme : "calvin"
);
const mode = ref(
  requestedMode === "dark" || (!requestedMode && requestedTheme === "dark") ? "dark" : "light"
);
const preset = computed(() => galleryTheme(themeName.value, mode.value));

// Popover, Menu and Dialog teleport to <body>, outside the wrapper above, so
// mirror the preset onto the root the way the app's theme does; otherwise
// their dark-mode states render with the light palette.
let rootVarKeys = [];
watch(
  preset,
  value => {
    const root = document.documentElement;
    root.classList.toggle("dark", value.dark);
    for (const key of rootVarKeys) root.style.removeProperty(key);
    rootVarKeys = Object.keys(value.vars || {});
    for (const key of rootVarKeys) root.style.setProperty(key, value.vars[key]);
  },
  { immediate: true }
);
const text = ref("");
const dialogOpen = ref(false);
const dialogMode = ref("form");
const dialogText = ref("");
const fullDialogOpen = ref(false);
const fullDialogText = ref("");
const scopeOverridden = ref(true);
const fieldTableColumns = [
  { label: "" },
  { label: "On", width: "7rem" },
  { label: "Off", width: "7rem" },
  { label: "" },
];
const fieldTableRows = ref([
  { key: "mon-fri", label: "Mon–Fri", onTime: "06:00", offTime: "22:00", enabled: true },
  { key: "sat-sun", label: "Sat–Sun", onTime: "08:00", offTime: "23:00", enabled: false },
]);

const galleryTab = ref("home");
const galleryTabs = [
  { value: "home", label: "Home", meta: "Kitchen, Hallway" },
  { value: "week", label: "Week", meta: "All screens" },
  { value: "chores", label: "Chores", meta: "Not shown", metaTone: "warn", dimmed: true },
];

const galleryEl = ref(null);
const menuOpen = ref(false);
const infoOpen = ref(false);
const menuNote = ref("No action chosen.");
const themeColour = ref("");
const customColour = ref("#3c7a5a");
const rowColour = ref("");

// The destructive item is authored in the middle on purpose: Menu sorts it last.
const galleryMenuItems = [
  { key: "edit", label: "Edit" },
  { key: "remove", label: "Remove", danger: true },
  { key: "duplicate", label: "Duplicate" },
];

const onMenuSelect = key => {
  menuNote.value = `Chose ${key}.`;
  menuOpen.value = false;
};

const openDialog = mode => {
  dialogMode.value = mode;
  dialogOpen.value = true;
};

// Keep the demo's selected colours inside the theme that is showing, so the
// gallery renders the "chosen swatch + name" state in every palette.
const syncGalleryColours = async () => {
  await nextTick();
  const palette = eventSwatches(galleryEl.value || undefined);
  themeColour.value = palette[0]?.hex || "";
  rowColour.value = palette[5]?.hex || palette[0]?.hex || "";
};

watch([themeName, mode], syncGalleryColours);
onMounted(syncGalleryColours);
</script>

<style scoped>
.ui-gallery {
  min-height: 100vh;
  padding: var(--gap-6);
  color: var(--ink);
  background: var(--bg-0);
}
.ui-gallery__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-inline);
  max-width: 80rem;
  margin: 0 auto var(--gap-section);
}
.ui-gallery__title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-title);
  font-weight: var(--weight-title);
}
.ui-gallery__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-inline);
}
.ui-gallery__body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-section);
  max-width: 80rem;
  margin: 0 auto;
}
.ui-gallery__section {
  padding: var(--gap-5);
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
}
.ui-gallery__heading {
  margin: 0 0 var(--gap-tight);
  font-family: var(--font-ui);
  font-size: var(--text-title);
  font-weight: var(--weight-title);
}
.ui-gallery__note {
  max-width: 48rem;
  margin: 0 0 var(--gap-group);
  font-size: var(--text-meta);
  line-height: 1.5;
  color: var(--ink-2);
}
.ui-gallery__group {
  margin: var(--gap-group) 0 var(--gap-stack);
  font-family: var(--font-data);
  font-size: var(--text-caption);
  font-weight: var(--weight-title);
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ui-gallery__group:first-of-type {
  margin-top: 0;
}
.ui-gallery__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gap-inline);
}
.ui-gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: var(--gap-group);
}
.ui-gallery__stack {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}
.ui-gallery__full-sheet {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--gap-stack);
  padding: var(--gap-5);
}
.ui-gallery__text {
  margin: 0;
  font-size: var(--text-body);
  line-height: 1.5;
  color: var(--ink);
}
.ui-gallery__glyph {
  width: 1.25rem;
  height: 1.25rem;
}
.ui-gallery__popover-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
  max-width: 22rem;
  padding: var(--gap-3);
}

/* The doctrine's phone width (below 600px): one column, 16px gutter. */
@media (max-width: 600px) {
  .ui-gallery {
    padding: var(--gap-4);
  }
  .ui-gallery__section {
    padding: var(--panel-pad-x) var(--panel-pad-y);
  }
  .ui-gallery__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
