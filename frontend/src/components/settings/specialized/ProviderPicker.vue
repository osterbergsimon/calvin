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
            <span class="pp-icon" aria-hidden="true">{{ providerLetter(provider) }}</span>
            <span class="pp-text">
              <span class="pp-name">{{ provider.label || provider.name }}</span>
              <span v-if="provider.description" class="pp-desc">{{ provider.description }}</span>
            </span>
            <span v-if="provider.disabled" class="pp-on">Turn on</span>
          </button>
        </li>
      </ul>
      <button v-if="moreLabel" type="button" class="pp-more" @click="$emit('more')">
        {{ moreLabel }}
      </button>
    </div>
  </div>
</template>

<script setup>
import IconButton from "@/components/ui/IconButton.vue";

// A small chooser of providers (plugins) for one kind of source. It carries no
// plugin-specific knowledge: the caller decides which plugins are candidates,
// in which order, and what each tile is called, then opens that provider's add
// form on `select`. A provider whose plugin is installed but turned off renders
// dimmed with Turn on: the click still selects it, and the caller enables it
// before continuing (§3.2).
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
  moreLabel: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["select", "close", "more"]);

const providerLetter = provider => {
  const source = provider.label || provider.name || "?";
  return source.charAt(0).toUpperCase();
};

const choose = provider => {
  if (provider.disabled) {
    emit("select", provider);
    return;
  }
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
  border-radius: 10px;
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
  font-size: 1.1rem;
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
  border-radius: 8px;
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

.pp-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  background: var(--bg-0);
  color: var(--ink-2);
  font-weight: 600;
}

.pp-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.pp-name {
  font-size: 0.95rem;
  font-weight: 600;
}

.pp-desc {
  font-size: 0.85rem;
  color: var(--ink-2);
  line-height: 1.4;
}

.pp-on {
  margin-left: auto;
  flex-shrink: 0;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--focus-edge);
  border-radius: 6px;
  color: var(--ink);
  font-size: 0.8rem;
  font-weight: 600;
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
  font-size: 0.9rem;
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
