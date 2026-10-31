<template>
  <ul class="menu" role="menu" :aria-label="label || undefined" @keydown="onKeydown">
    <li v-for="item in orderedItems" :key="item.key" role="none">
      <button
        :ref="el => setItemRef(el, item.key)"
        type="button"
        role="menuitem"
        class="menu__item"
        :class="{ 'menu__item--danger': item.danger }"
        :disabled="item.disabled"
        tabindex="-1"
        @click="choose(item)"
        @focus="activeKey = item.key"
      >
        {{ item.label }}
      </button>
    </li>
  </ul>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue";

// An action list inside a Popover (docs/design/frontend-doctrine.md §3). Items
// are at least --touch-target tall, and a destructive item always sorts last
// so "Remove" is never the first thing a thumb lands on. Arrow keys, Home and
// End move focus; Escape and Tab close the owning popover.
const props = defineProps({
  // [{ key, label, danger?, disabled? }]
  items: { type: Array, default: () => [] },
  label: { type: String, default: "" },
});

const emit = defineEmits(["select", "close"]);

const activeKey = ref(null);
const itemEls = new Map();

// Stable partition: danger items last, everything else in authored order.
const orderedItems = computed(() => [
  ...props.items.filter(item => !item.danger),
  ...props.items.filter(item => item.danger),
]);

const enabledItems = () => orderedItems.value.filter(item => !item.disabled);

const setItemRef = (el, key) => {
  if (el) itemEls.set(key, el);
  else itemEls.delete(key);
};

function focusItem(key) {
  const el = itemEls.get(key);
  if (!el) return;
  activeKey.value = key;
  el.focus();
}

function move(delta) {
  const items = enabledItems();
  if (!items.length) return;
  const current = items.findIndex(item => item.key === activeKey.value);
  const next = current === -1 ? (delta > 0 ? 0 : items.length - 1) : current + delta;
  const wrapped = (next + items.length) % items.length;
  focusItem(items[wrapped].key);
}

function onKeydown(event) {
  const items = enabledItems();
  if (!items.length) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    move(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    move(-1);
  } else if (event.key === "Home") {
    event.preventDefault();
    focusItem(items[0].key);
  } else if (event.key === "End") {
    event.preventDefault();
    focusItem(items[items.length - 1].key);
  } else if (event.key === "Escape") {
    event.preventDefault();
    emit("close", "escape");
  } else if (event.key === "Tab") {
    emit("close", "tab");
  }
}

function choose(item) {
  if (item.disabled) return;
  emit("select", item.key);
}

onMounted(() => {
  nextTick(() => {
    const first = orderedItems.value.find(item => !item.disabled);
    if (first) focusItem(first.key);
  });
});
</script>

<style scoped>
.menu {
  min-width: 9rem;
  margin: 0;
  padding: var(--gap-1);
  list-style: none;
}

.menu__item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: var(--touch-target);
  padding: 0 var(--gap-3);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  font-weight: var(--weight-body);
  color: var(--ink);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--radius-control);
  cursor: pointer;
}

.menu__item:hover:not(:disabled),
.menu__item:focus-visible {
  background: color-mix(in srgb, var(--ink) 6%, transparent);
}

.menu__item:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}

.menu__item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu__item--danger {
  color: var(--err-text);
}

.menu__item--danger:hover:not(:disabled),
.menu__item--danger:focus-visible {
  background: color-mix(in srgb, var(--err) 10%, transparent);
}
</style>
