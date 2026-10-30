<template>
  <div v-if="show" class="pp-overlay dialog-above-osk" @click.self="$emit('close')">
    <div class="pp-panel" role="dialog" aria-modal="true" :aria-label="title">
      <div class="pp-head">
        <h3 class="pp-title">{{ title }}</h3>
        <IconButton variant="ghost" label="Close" @click="$emit('close')">×</IconButton>
      </div>
      <ul class="pp-list">
        <li v-for="provider in providers" :key="provider.id">
          <button
            type="button"
            class="pp-tile"
            :class="{ 'pp-tile--off': provider.disabled }"
            :data-provider-id="provider.id"
            @click="choose(provider)"
          >
            <span class="pp-icon" aria-hidden="true">
              <svg v-if="provider.svg" class="pp-icon-svg" viewBox="0 0 24 24">
                <path :d="provider.svg" fill="currentColor" />
              </svg>
              <img
                v-else-if="isIconFile(provider.icon)"
                class="pp-icon-img"
                :src="iconUrl(provider)"
                alt=""
              />
              <template v-else-if="provider.icon">{{ provider.icon }}</template>
              <template v-else>{{ providerLetter(provider) }}</template>
            </span>
            <span class="pp-text">
              <span class="pp-name">{{ provider.label || provider.name }}</span>
              <span v-if="provider.description" class="pp-desc">{{ provider.description }}</span>
            </span>
            <span v-if="provider.disabled" class="pp-on">Turn on</span>
          </button>
        </li>
      </ul>
      <p v-if="providers.length === 0" class="pp-empty">
        No add-ons of this kind are installed yet.
      </p>

      <!-- §3.7: discovering an add-on is bridged here, installing stays the
           official catalog's job and management stays in Plugins. -->
      <section v-if="catalogProviders.length > 0" class="pp-catalog">
        <h4 class="pp-group">From the Calvin catalog</h4>
        <ul class="pp-list">
          <li v-for="item in catalogProviders" :key="`catalog-${item.id}`">
            <div
              class="pp-tile pp-tile--catalog"
              :class="{ 'pp-tile--off': item.status === 'installing' }"
              :data-catalog-id="item.id"
            >
              <span class="pp-icon" aria-hidden="true">
                <img v-if="isIconFile(item.icon)" class="pp-icon-img" :src="iconUrl(item)" alt="" />
                <template v-else-if="item.icon">{{ item.icon }}</template>
                <template v-else>{{ providerLetter(item) }}</template>
              </span>
              <span class="pp-text">
                <span class="pp-name">{{ item.label || item.name }}</span>
                <span v-if="item.description" class="pp-desc">{{ item.description }}</span>
                <span v-if="item.error" class="pp-error">
                  {{ item.error }}
                  <button type="button" class="pp-error-link" @click="$emit('more')">
                    See details in Plugins ›
                  </button>
                </span>
              </span>
              <span v-if="item.status === 'installing'" class="pp-install pp-install--busy">
                Installing…
              </span>
              <span v-else-if="item.status === 'installed'" class="pp-installed">Installed ✓</span>
              <button
                v-else
                type="button"
                class="pp-install"
                :data-install-id="item.id"
                @click="$emit('install', item)"
              >
                Install
              </button>
            </div>
          </li>
        </ul>
      </section>

      <button v-if="moreLabel" type="button" class="pp-more" @click="$emit('more')">
        {{ moreLabel }}
      </button>
    </div>
  </div>
</template>

<script setup>
import IconButton from "@/components/ui/IconButton.vue";
import { isIconFile, pluginIconLetter, pluginIconUrl } from "@/utils/pluginIcon";

// A small chooser of providers (plugins) for one kind of source. It carries no
// plugin-specific knowledge: the caller decides which plugins are candidates,
// in which order, and what each tile is called, then opens that provider's add
// form on `select`. A provider whose plugin is installed but turned off renders
// dimmed with Turn on: the click still selects it, and the caller enables it
// before continuing (§3.2).
//
// `catalogProviders` are not installed yet: they come from the official add-on
// catalog (§3.7). Their lifecycle (confirm, Installing…, error) is owned by the
// caller, which is why each row only renders the caller's status.
defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: "Add a source",
  },
  providers: {
    type: Array,
    default: () => [],
  },
  catalogProviders: {
    type: Array,
    default: () => [],
  },
  moreLabel: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["select", "install", "close", "more"]);

const providerLetter = provider => pluginIconLetter(provider);
const iconUrl = provider => pluginIconUrl(provider);

const choose = provider => {
  emit("select", provider);
};
</script>

<style scoped>
.pp-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: color-mix(in srgb, var(--ink) 55%, transparent);
  z-index: 1000;
}

.pp-panel {
  width: 30rem;
  max-width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 20px var(--shadow);
}

.pp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--line);
}

.pp-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--ink);
}

.pp-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 1rem;
  list-style: none;
}

.pp-tile {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  min-height: 56px;
  padding: 0.75rem 1rem;
  background: var(--bg-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-family: var(--font-ui);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.pp-tile:hover {
  border-color: var(--focus);
  background: color-mix(in srgb, var(--focus) 8%, var(--bg-2));
}

.pp-tile:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.pp-tile--off {
  opacity: 0.55;
}

/* Catalog rows are not a single click target: Install is the action. */
.pp-tile--catalog {
  cursor: default;
}

.pp-tile--catalog:hover {
  border-color: var(--line);
  background: var(--bg-2);
}

.pp-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-xs);
  background: var(--bg-0);
  color: var(--ink-2);
  font-weight: 600;
  overflow: hidden;
}

.pp-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pp-icon-svg {
  width: 60%;
  height: 60%;
}

.pp-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.pp-name {
  font-size: var(--fs-md);
  font-weight: 600;
}

.pp-desc {
  font-size: var(--fs-sm);
  color: var(--ink-2);
  line-height: 1.4;
}

.pp-error {
  font-size: var(--fs-xs);
  color: var(--err-text);
  line-height: 1.4;
}

.pp-error-link {
  padding: 0;
  background: transparent;
  color: var(--err-text);
  border: 0;
  border-bottom: 1px dotted currentColor;
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  cursor: pointer;
}

.pp-on {
  margin-left: auto;
  flex-shrink: 0;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--focus-edge);
  border-radius: var(--radius-xs);
  color: var(--ink);
  font-size: var(--fs-xs);
  font-weight: 600;
}

.pp-catalog {
  border-top: 1px solid var(--line);
}

.pp-group {
  margin: 0;
  padding: var(--space-xl) var(--space-3xl) 0;
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink);
}

.pp-install {
  margin-left: auto;
  flex-shrink: 0;
  min-height: var(--touch-target);
  padding: 0.4rem 1rem;
  background: var(--focus);
  color: var(--focus-ink);
  border: 0;
  border-radius: var(--radius-xs);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}

.pp-install:hover {
  background: color-mix(in srgb, var(--focus) 88%, var(--ink));
}

.pp-install:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.pp-install--busy {
  background: transparent;
  color: var(--ink-3);
  border: 1px solid var(--line);
  cursor: progress;
}

.pp-installed {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--ok-text);
  font-size: var(--fs-sm);
  font-weight: 600;
}

.pp-empty {
  margin: 0;
  padding: 0 1.5rem 1rem;
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  color: var(--ink-3);
}

.pp-more {
  display: block;
  width: 100%;
  padding: 0.9rem 1.5rem;
  background: transparent;
  color: var(--ink-2);
  border: 0;
  border-top: 1px solid var(--line);
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  text-align: left;
  cursor: pointer;
}

.pp-more:hover {
  color: var(--ink);
}

.pp-more:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
</style>
