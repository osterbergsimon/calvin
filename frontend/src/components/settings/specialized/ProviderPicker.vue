<template>
  <Dialog :model-value="show" :title="title" @update:model-value="handleDialog">
    <ul class="pp-list">
      <li v-for="provider in providers" :key="provider.id">
        <Button
          variant="secondary"
          class="pp-tile"
          :class="{ 'pp-tile--off': provider.disabled }"
          :data-provider-id="provider.id"
          @click="choose(provider)"
        >
          <template #icon>
            <span class="pp-icon" aria-hidden="true">
              <svg
                v-if="provider.svg || pluginIconPath(provider)"
                class="pp-icon-svg"
                viewBox="0 0 24 24"
              >
                <path :d="provider.svg || pluginIconPath(provider)" fill="currentColor" />
              </svg>
              <img
                v-else-if="isIconFile(provider.icon)"
                class="pp-icon-img"
                :src="iconUrl(provider)"
                alt=""
              />
              <template v-else>{{ providerLetter(provider) }}</template>
            </span>
          </template>
          <span class="pp-tile-body">
            <span class="pp-text">
              <span class="pp-name">{{ provider.label || provider.name }}</span>
              <span v-if="provider.description" class="pp-desc">{{ provider.description }}</span>
            </span>
            <Tag v-if="provider.disabled" class="pp-on">Turn on</Tag>
          </span>
        </Button>
      </li>
    </ul>
    <EmptyState
      v-if="providers.length === 0"
      compact
      :inset="false"
      class="pp-empty"
      :icon="mdiPuzzleOutline"
      message="No add-ons of this kind are installed yet."
    />

    <!-- §3.7: discovering an add-on is bridged here, installing stays the
         official catalog's job and management stays in Plugins. -->
    <section v-if="catalogProviders.length > 0" class="pp-catalog">
      <h4 class="pp-group">From the Calvin catalog</h4>
      <ul class="pp-list">
        <li v-for="item in catalogProviders" :key="`catalog-${item.id}`">
          <ListRow
            :name="item.label || item.name"
            :data-catalog-id="item.id"
            :disabled="item.status === 'installing'"
          >
            <template #lead>
              <span class="pp-icon" aria-hidden="true">
                <svg v-if="pluginIconPath(item)" class="pp-icon-svg" viewBox="0 0 24 24">
                  <path :d="pluginIconPath(item)" fill="currentColor" />
                </svg>
                <img
                  v-else-if="isIconFile(item.icon)"
                  class="pp-icon-img"
                  :src="iconUrl(item)"
                  alt=""
                />
                <template v-else>{{ providerLetter(item) }}</template>
              </span>
            </template>

            <template #meta>
              <span v-if="item.description" class="pp-desc">{{ item.description }}</span>
              <InlineNote v-if="item.error" tone="err">
                {{ item.error }}
                <template #action>
                  <Button variant="link" size="sm" class="pp-error-link" @click="$emit('more')">
                    See details in Plugins ›
                  </Button>
                </template>
              </InlineNote>
            </template>

            <template #actions>
              <Tag v-if="item.status === 'installing'" class="pp-install pp-install--busy">
                Installing…
              </Tag>
              <Tag v-else-if="item.status === 'installed'" tone="ok" class="pp-installed">
                Installed ✓
              </Tag>
              <Button
                v-else
                variant="primary"
                size="sm"
                class="pp-install"
                :data-install-id="item.id"
                @click="$emit('install', item)"
              >
                Install
              </Button>
            </template>
          </ListRow>
        </li>
      </ul>
    </section>

    <template #actions>
      <Button v-if="moreLabel" variant="ghost" class="pp-more" @click="$emit('more')">
        {{ moreLabel }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup>
import { mdiPuzzleOutline } from "@mdi/js";
import Button from "@/components/ui/Button.vue";
import Dialog from "@/components/ui/Dialog.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import InlineNote from "@/components/ui/InlineNote.vue";
import ListRow from "@/components/ui/ListRow.vue";
import Tag from "@/components/ui/Tag.vue";
import { isIconFile, pluginIconLetter, pluginIconPath, pluginIconUrl } from "@/utils/pluginIcon";

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

const handleDialog = open => {
  if (!open) emit("close");
};
</script>

<style scoped>
.pp-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pp-tile {
  width: 100%;
  height: auto;
  min-height: 3.5rem;
  justify-content: flex-start;
  gap: var(--gap-3);
  line-height: 1.3;
  white-space: normal;
  text-align: left;
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
  overflow: hidden;
  border-radius: var(--radius-control);
  background: var(--bg-0);
  color: var(--ink-2);
  font-weight: var(--weight-title);
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

.pp-tile-body {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--gap-inline);
  width: 100%;
}

.pp-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--gap-tight);
  min-width: 0;
  text-align: left;
}

.pp-name {
  font-size: var(--text-body);
  font-weight: var(--weight-strong);
}

.pp-desc {
  font-size: var(--text-meta);
  line-height: 1.4;
  color: var(--ink-2);
}

.pp-on {
  flex-shrink: 0;
  margin-left: auto;
}

.pp-catalog {
  margin-top: var(--gap-4);
  padding-top: var(--gap-4);
  border-top: 1px solid var(--line);
}

.pp-group {
  margin: 0 0 var(--gap-inline);
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-strong);
  color: var(--ink);
}

.pp-install,
.pp-installed {
  flex-shrink: 0;
  margin-left: auto;
}

.pp-more {
  width: 100%;
  justify-content: flex-start;
}
</style>
