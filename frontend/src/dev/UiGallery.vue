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
    </main>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { mdiCheck, mdiRefresh } from "@mdi/js";
import Button from "../components/ui/Button.vue";
import SegmentedControl from "../components/ui/SegmentedControl.vue";

const theme = ref("light");
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

/* The doctrine's phone width (below 600px): one column, 16px gutter. */
@media (max-width: 600px) {
  .ui-gallery {
    padding: var(--gap-4);
  }
  .ui-gallery__section {
    padding: var(--panel-pad-x) var(--panel-pad-y);
  }
}
</style>
