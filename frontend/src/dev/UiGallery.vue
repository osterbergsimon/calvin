<template>
  <div class="ui-gallery" :class="{ dark: theme === 'dark' }" data-test="ui-gallery">
    <header class="ui-gallery__bar">
      <h1 class="ui-gallery__title">Calvin UI gallery</h1>
      <SegmentedControl
        v-model="theme"
        :options="[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Backlit' },
        ]"
        aria-label="Theme"
      />
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
          The one-line note under a row: a hint, a warning, an error or a confirmation. Tones are
          text only; status colours never decorate. An action can sit on the same line.
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
  </div>
</template>

<script setup>
import { ref } from "vue";
import {
  mdiCalendar,
  mdiCheck,
  mdiDotsHorizontal,
  mdiImage,
  mdiMonitor,
  mdiRefresh,
} from "@mdi/js";
import Button from "../components/ui/Button.vue";
import Card from "../components/ui/Card.vue";
import Dialog from "../components/ui/Dialog.vue";
import InlineNote from "../components/ui/InlineNote.vue";
import ListRow from "../components/ui/ListRow.vue";
import ScopeLine from "../components/ui/ScopeLine.vue";
import SegmentedControl from "../components/ui/SegmentedControl.vue";
import SettingGroup from "../components/ui/SettingGroup.vue";
import TextField from "../components/ui/TextField.vue";
import ToggleSwitch from "../components/ui/ToggleSwitch.vue";
import SettingRow from "../components/settings/shell/SettingRow.vue";
import SettingsSection from "../components/settings/shell/SettingsSection.vue";

// ?theme=light|dark makes the snapshot and the reviewer's link deterministic;
// without it the switcher starts on the light theme.
const requested = new URLSearchParams(window.location.search).get("theme");
const theme = ref(requested === "dark" ? "dark" : "light");
const text = ref("");
const dialogOpen = ref(false);
const dialogMode = ref("form");
const dialogText = ref("");
const scopeOverridden = ref(true);

const openDialog = mode => {
  dialogMode.value = mode;
  dialogOpen.value = true;
};
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
.ui-gallery__text {
  margin: 0;
  font-size: var(--text-body);
  line-height: 1.5;
  color: var(--ink);
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
