# Cycle C3 — Content Sources category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Content Sources settings category to the Cycle C1 shell (eyebrow `SettingsSection`s of `SettingRow`s), embedding the calendar/image/service editors as-is and rebuilding the Photos settings as rows.

**Architecture:** One new `ContentSettings.vue` (mirrors `DisplaySettings.vue`): CALENDARS / IMAGE SOURCES / SERVICES embed `CalendarSourcesTab`/`ImagesTab`/`ServicesTab`; PHOTOS is rebuilt as rows. `Settings.vue` swaps the old `ContentSourcesCategory` for it and adds a `content` entry to the existing `SECTION_BY_CATEGORY_TAB` jump map (auto-joining `MIGRATED_CATEGORIES`). Orphaned `ContentSourcesCategory.vue` + `PhotosTab.vue` are deleted.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), Vite, Pinia, Vitest + @vue/test-utils + jsdom. Single spec: `npx vitest run <path>` (from `frontend/`). Lint: `npx eslint src`.

## Global Constraints

- Reference spec: `docs/design/2026-06-28-cycle-c3-content-category.md`. Canonical row idiom: existing `frontend/src/components/settings/categories/DisplaySettings.vue` (and the C2 `ClockBarSettings.vue`). Read one before writing.
- Dashboard keyboard vocabulary FROZEN: do not modify `frontend/src/composables/useKeyboardActions.js`.
- New markup uses **new semantic tokens only** (`--ink`/`--ink-*`/`--bg-*`/`--line`/`--focus`/`--ok`/`--warn`/`--err`/`--font-ui`/`--font-data`). NO legacy tokens (`--accent-primary`/`--text-*`/`--bg-secondary`/`--border-color`), NO hardcoded hex/rgb in new components.
- Controls keyboard-operable with `:focus-visible`; ≥44px targets (shell controls already satisfy this).
- Preserve `useConfigForm` auto-save and `settingsRegistry` search.
- Embedded editors keep current styling this cycle (restyle = bead `calvin-hbp`).
- Stage **only** the files each task lists. Never `git add -A` (untracked `.beads/` and `frontend/public/test-calendar.ics` must never be committed).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (use `git commit -F -`).
- Do NOT `git push`.

**Control signatures (Cycle A/C1, unchanged):**
- `SettingsSection` — props `{ id: String!, title: String! }` → `<section id="section-{id}">` + eyebrow + `.settings-section__panel` slot.
- `SettingRow` — props `{ label: String!, description: String = "" }`; default slot = control.
- `ToggleSwitch` — `{ modelValue: Boolean, ariaLabel }`; emits `update:modelValue`.
- `SelectPill` — `{ modelValue: [String,Number], options: [{value,label}], swatch }`; emits `update:modelValue`.
- `NumberStepper` — `{ modelValue: Number, min, max, step, ariaLabel }`; emits `update:modelValue` (already clamped).

**Embed interfaces:** `CalendarSourcesTab` — props `{ config }`, emits `update:config`. `ImagesTab`, `ServicesTab` — no props/emits (self-managed via `usePlugins`).

**Binding idiom:** `:model-value="config.<key>"` + `@update:model-value="v => emit('update:config', { <key>: v })"`.

---

### Task 1: `ContentSettings.vue`

**Files:**
- Create: `frontend/src/components/settings/categories/ContentSettings.vue`
- Test: `frontend/tests/unit/components/settings/ContentSettings.spec.js`

**Interfaces:**
- Produces: `ContentSettings` — props `{ config: Object! }`; emits `update:config`. Section ids: `content-calendars`, `content-photos`, `content-images`, `content-services`.

- [ ] **Step 1: Write the failing test**

```js
// frontend/tests/unit/components/settings/ContentSettings.spec.js
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ContentSettings from "@/components/settings/categories/ContentSettings.vue";

const stubs = { CalendarSourcesTab: true, ImagesTab: true, ServicesTab: true };
const baseConfig = {
  photoRotationInterval: 30,
  imageDisplayMode: "smart",
  randomizeImages: false,
  photoFrameEnabled: false,
  photoFrameMode: false,
  photoFrameTimeout: 60,
};

describe("ContentSettings", () => {
  it("renders the four sections", () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    for (const id of ["content-calendars", "content-photos", "content-images", "content-services"]) {
      expect(wrapper.find(`#section-${id}`).exists()).toBe(true);
    }
  });

  it("emits update:config when Randomize image order toggles", async () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    // The Randomize toggle is the ToggleSwitch whose row carries that label.
    const toggles = wrapper.findAll('[role="switch"]');
    // randomizeImages is the 2nd toggle (photo-frame is the 1st-or-2nd depending on order);
    // assert at least one toggle emits a randomizeImages patch when clicked.
    let sawRandomize = false;
    for (const t of toggles) {
      await t.trigger("click");
    }
    for (const e of wrapper.emitted("update:config") || []) {
      if (Object.prototype.hasOwnProperty.call(e[0], "randomizeImages")) sawRandomize = true;
    }
    expect(sawRandomize).toBe(true);
  });

  it("emits both photoFrameEnabled and photoFrameMode when the photo-frame toggle changes", async () => {
    const wrapper = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    const toggles = wrapper.findAll('[role="switch"]');
    for (const t of toggles) await t.trigger("click");
    const frameEmit = (wrapper.emitted("update:config") || []).find(
      e => Object.prototype.hasOwnProperty.call(e[0], "photoFrameEnabled")
    );
    expect(frameEmit).toBeTruthy();
    expect(frameEmit[0]).toHaveProperty("photoFrameMode");
  });

  it("reveals the photo-frame timeout only when photo-frame mode is on", () => {
    const off = mount(ContentSettings, { props: { config: baseConfig }, global: { stubs } });
    expect(off.text()).not.toContain("Photo-frame timeout");
    const on = mount(ContentSettings, {
      props: { config: { ...baseConfig, photoFrameEnabled: true } },
      global: { stubs },
    });
    expect(on.text()).toContain("Photo-frame timeout");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/settings/ContentSettings.spec.js`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Create the component**

```vue
<!-- frontend/src/components/settings/categories/ContentSettings.vue -->
<template>
  <div class="content-settings">
    <SettingsSection id="content-calendars" title="Calendars">
      <CalendarSourcesTab :config="config" @update:config="patch => emit('update:config', patch)" />
    </SettingsSection>

    <SettingsSection id="content-photos" title="Photos">
      <SettingRow label="Rotation interval" description="Seconds each photo is shown before advancing.">
        <NumberStepper
          :model-value="config.photoRotationInterval || 30"
          :min="5"
          :max="3600"
          :step="1"
          aria-label="Photo rotation interval in seconds"
          @update:model-value="v => emit('update:config', { photoRotationInterval: v })"
        />
      </SettingRow>
      <SettingRow label="Image display mode" description="How each image is fitted to the screen.">
        <SelectPill
          :model-value="config.imageDisplayMode || 'smart'"
          :options="[
            { value: 'smart', label: 'Smart' },
            { value: 'fit', label: 'Fit' },
            { value: 'fill', label: 'Fill' },
            { value: 'crop', label: 'Crop' },
            { value: 'center', label: 'Center' },
          ]"
          @update:model-value="v => emit('update:config', { imageDisplayMode: v })"
        />
      </SettingRow>
      <SettingRow label="Randomize image order" description="Shuffle the order photos are displayed in.">
        <ToggleSwitch
          :model-value="config.randomizeImages ?? false"
          aria-label="Randomize image order"
          @update:model-value="v => emit('update:config', { randomizeImages: v })"
        />
      </SettingRow>
      <SettingRow label="Photo-frame mode" description="Show a single photo full-screen as a digital frame.">
        <ToggleSwitch
          :model-value="config.photoFrameEnabled || config.photoFrameMode"
          aria-label="Photo-frame mode"
          @update:model-value="v => emit('update:config', { photoFrameEnabled: v, photoFrameMode: v })"
        />
      </SettingRow>
      <SettingRow
        v-if="config.photoFrameEnabled || config.photoFrameMode"
        label="Photo-frame timeout"
        description="Seconds before the photo frame advances."
      >
        <NumberStepper
          :model-value="config.photoFrameTimeout || 60"
          :min="5"
          :max="3600"
          :step="1"
          aria-label="Photo-frame timeout in seconds"
          @update:model-value="v => emit('update:config', { photoFrameTimeout: v })"
        />
      </SettingRow>
    </SettingsSection>

    <SettingsSection id="content-images" title="Image sources">
      <ImagesTab />
    </SettingsSection>

    <SettingsSection id="content-services" title="Services">
      <ServicesTab />
    </SettingsSection>
  </div>
</template>

<script setup>
import SettingsSection from "@/components/settings/shell/SettingsSection.vue";
import SettingRow from "@/components/settings/shell/SettingRow.vue";
import ToggleSwitch from "@/components/ui/ToggleSwitch.vue";
import SelectPill from "@/components/ui/SelectPill.vue";
import NumberStepper from "@/components/ui/NumberStepper.vue";
import CalendarSourcesTab from "@/components/settings/tabs/content/CalendarSourcesTab.vue";
import ImagesTab from "@/components/settings/tabs/content/ImagesTab.vue";
import ServicesTab from "@/components/settings/tabs/content/ServicesTab.vue";

defineProps({ config: { type: Object, required: true } });
const emit = defineEmits(["update:config"]);
</script>

<style scoped>
.content-settings {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/settings/ContentSettings.spec.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/categories/ContentSettings.vue frontend/tests/unit/components/settings/ContentSettings.spec.js
git commit -F - <<'EOF'
feat(settings): add ContentSettings category (C3 Task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Wire `ContentSettings` into `Settings.vue` + add `content` section-jump entry

**Files:**
- Modify: `frontend/src/views/Settings.vue`
- Modify: `frontend/tests/unit/views/SettingsShell.spec.js`

**Interfaces:**
- Consumes: `ContentSettings` (Task 1).

- [ ] **Step 1: Update the shell test**

In `frontend/tests/unit/views/SettingsShell.spec.js`, add an assertion that selecting the `content` category renders `ContentSettings` — follow the existing pattern the spec uses for the other migrated categories (stub `ContentSettings`; seed the active category via `sessionStorage.setItem("settings_active_category", "content")` exactly as the C2 device/maintenance tests do; assert the stub renders). Read the current spec first and mirror its style.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/views/SettingsShell.spec.js`
Expected: FAIL — `Settings.vue` still renders the old `ContentSourcesCategory`.

- [ ] **Step 3: Swap the import + render block**

In `frontend/src/views/Settings.vue`:
- Replace the `defineAsyncComponent` import of `ContentSourcesCategory` (the `const ContentSourcesCategory = defineAsyncComponent(() => import("@/components/settings/categories/ContentSourcesCategory.vue"))` line, ~line 97) with a direct import:
  `import ContentSettings from "@/components/settings/categories/ContentSettings.vue";`
  (place it with the other static category imports; remove the old async const). If the other migrated categories are imported statically, match that; if `ContentSourcesCategory` was the only async one, just remove the async wrapper.
- Replace the render element (~line 40):

```vue
<ContentSettings
  v-if="activeCategory === 'content' && localConfig"
  :key="categoryRenderKey"
  :config="localConfig"
  @update:config="handleConfigUpdate"
/>
```

- [ ] **Step 4: Add the `content` entry to the section-jump map**

In `SECTION_BY_CATEGORY_TAB` (added in C2), add the `content` block alongside the existing entries:

```js
content: {
  calendars: "content-calendars",
  photos: "content-photos",
  images: "content-images",
  services: "content-services",
},
```

`MIGRATED_CATEGORIES` is `new Set(Object.keys(SECTION_BY_CATEGORY_TAB))`, so `content` is included automatically — no other change is needed (this makes `onJump` and the `?setting=` watch scroll to the content sections and stop writing the `tabKey` hint for `content`).

- [ ] **Step 5: Run shell + preservation specs**

Run: `npx vitest run tests/unit/views/SettingsShell.spec.js tests/unit/components/settingsRegistry.spec.js tests/unit/composables/useConfigForm.spec.js`
Expected: PASS.
Run: `npx eslint src/views/Settings.vue`
Expected: 0 problems (no leftover `ContentSourcesCategory` import).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/Settings.vue frontend/tests/unit/views/SettingsShell.spec.js
git commit -F - <<'EOF'
feat(settings): render ContentSettings + content section-jump (C3 Task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Delete orphaned components + full gate

**Files:**
- Delete: `frontend/src/components/settings/categories/ContentSourcesCategory.vue`, `frontend/src/components/settings/tabs/layout/PhotosTab.vue`
- Possibly modify/delete: any test importing a deleted component.

- [ ] **Step 1: Reference-check the deletion candidates**

```bash
cd frontend
for f in ContentSourcesCategory PhotosTab; do
  echo "== $f =="; grep -rn "$f" src tests --include="*.vue" --include="*.js" | grep -v "/$f.vue"
done
```

Expected: no hits other than the files themselves. If a hit remains (e.g. a spec importing `PhotosTab`, or another category importing it), do NOT delete that file — record it in the report and leave it. (Note: `PhotosTab.vue` lives under `tabs/layout/` but is used by Content; confirm nothing else imports it.)

- [ ] **Step 2: Delete the confirmed-orphaned files**

```bash
cd frontend
git rm src/components/settings/categories/ContentSourcesCategory.vue \
       src/components/settings/tabs/layout/PhotosTab.vue
```

(Omit any file Step 1 flagged as still-referenced.)

- [ ] **Step 3: Handle any orphaned spec**

If a spec imported a now-deleted component, decide per the C2 lesson: if it tested ONLY deleted components, delete that spec and note it; if it also asserted still-living behavior, migrate that assertion to a focused spec instead. Record the decision in the report.

- [ ] **Step 4: Full suite + lint**

Run: `npx vitest run`
Expected: all tests pass.
Run: `npx eslint src`
Expected: 0 errors, 0 warnings.

If a deleted-component test fails, resolve per Step 3 (delete its spec, or restore a premature deletion).

- [ ] **Step 5: Commit**

```bash
cd /home/tux/code/calvin
git add -u frontend/src/components/settings
git status  # CONFIRM only the deletions are staged — never .beads/ or frontend/public/test-calendar.ics
git commit -F - <<'EOF'
chore(settings): retire ContentSourcesCategory + PhotosTab (C3 Task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

> `git add -u frontend/src/components/settings` stages only tracked deletions/changes under that path — it will not touch untracked `.beads/` or `frontend/public/test-calendar.ics`. If a spec under `frontend/tests` was deleted in Step 3, `git rm` it explicitly and include it in the commit.

- [ ] **Step 6: On-device verification (manual, controller/user)**

Against a running stack: rail → Content renders the four eyebrow sections; breadcrumb scroll-spy updates; search-jumping into each content destination scrolls to the right section; the Photos rows work; the embedded Calendars/Images/Services editors still function.

---

## Notes for the executor

- Task 1 is independent; Task 2 depends on Task 1; Task 3 depends on Task 2.
- Embedded editors are stubbed in the new component's unit test; their real behavior is covered by their own existing specs + the on-device pass.
- The photo-frame toggle deliberately reads `photoFrameEnabled || photoFrameMode` and emits BOTH keys (backend + UI compat) — preserve this exactly; it mirrors the old `handlePhotoFrameModeChange`.
