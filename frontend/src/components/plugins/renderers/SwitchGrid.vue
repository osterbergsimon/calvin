<template>
  <div class="switch-grid">
    <EmptyState
      v-if="!items.length"
      compact
      :inset="false"
      :message="schema.empty_text || 'No switches chosen yet.'"
    />
    <section v-for="group in groups" :key="group.key" class="switch-grid__group">
      <h3 v-if="group.title" class="switch-grid__heading">{{ group.title }}</h3>
      <div class="switch-grid__tiles">
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="switch-tile"
          :class="{
            'switch-tile--on': shown(item) === 'on',
            'switch-tile--unavailable': shown(item) === 'unavailable',
          }"
          :aria-pressed="pressed(item)"
          :aria-busy="pending.has(item.id) ? 'true' : undefined"
          :aria-disabled="inert(item) ? 'true' : undefined"
          @click="tap(item)"
        >
          <span class="switch-tile__top">
            <span class="switch-tile__label">{{ item.label }}</span>
            <span class="switch-tile__lamp" aria-hidden="true" />
          </span>
          <span class="switch-tile__state">{{ stateWords(item) }}</span>
        </button>
      </div>
    </section>
    <div class="switch-grid__live" role="status" aria-live="polite">
      <InlineNote v-if="note" tone="err">{{ note }}</InlineNote>
    </div>
  </div>
</template>

<script setup>
// switch-grid (homey switch tiles §3): one tile per item a plugin's fetch()
// returns, and a tap runs the item's declared action through `runAction`
// (SchemaRenderer builds it from usePluginAction, so this file has no API code).
//
// A tap shows the target state at once with a pending label, then settles on
// the state the action answers. A failure returns the tile to what it showed
// before and says why in one polite live region. Pending and unavailable tiles
// are aria-disabled, never `disabled`, so a focused tile keeps focus when its
// state flips (doctrine §5, focus never lost).
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { resolvePath } from "../../../utils/jsonPath";
import EmptyState from "../../ui/EmptyState.vue";
import InlineNote from "../../ui/InlineNote.vue";

const props = defineProps({
  schema: { type: Object, required: true },
  data: { type: [Object, Array, null], default: null },
  // Changes on every successful fetch, identical payload or not.
  dataUpdatedAt: { type: Number, default: 0 },
  runAction: {
    type: Function,
    default: () => Promise.reject(new Error("No action runner")),
  },
});

const STATES = new Set(["on", "off", "unavailable"]);
const NOTE_MS = 6000;

const REFUSED = "Can't be switched from here";
const WORDS = { on: "On", off: "Off", unavailable: "Not responding" };
const PENDING_WORDS = { on: "Turning on…", off: "Turning off…" };

// Plain words for each failure the action route can answer (Part 1 contract).
const RATE_LIMITED = "Too many taps. Try again in a moment.";
const BUSY = "Still busy with the last tap. Try again in a moment.";
const TIMED_OUT = "No answer in time. Try again.";
const NOT_USABLE = "This switch can't be used right now.";
const NOT_USABLE_CODES = new Set([
  "unknown_action",
  "invalid_action_params",
  "invalid_action_body",
]);

const items = computed(() => {
  const slice = resolvePath(props.data, props.schema.data_path || "$.items");
  if (!Array.isArray(slice)) return [];
  return slice.filter(
    item =>
      item &&
      typeof item === "object" &&
      (typeof item.id === "string" || typeof item.id === "number") &&
      typeof item.label === "string" &&
      item.label
  );
});

// Groups in first-seen order; items with no group sit in an untitled group.
const groups = computed(() => {
  const byKey = new Map();
  for (const item of items.value) {
    const title = typeof item.group === "string" ? item.group : "";
    if (!byKey.has(title)) byKey.set(title, { key: `g:${title}`, title, items: [] });
    byKey.get(title).items.push(item);
  }
  return [...byKey.values()];
});

// id -> target state while its action runs. Data updates never touch it, so a
// poll landing mid-tap cannot flip a pending tile back.
const pending = reactive(new Map());
// id -> state the action answered, until the next data arrives.
const settled = reactive(new Map());
// ids the plugin refused; unavailable until the next data arrives.
const refused = reactive(new Set());
const note = ref("");
let noteTimer = null;
let noteStamp = 0;

// Fresh data of any kind, even an identical refetch (same object, no change
// of `data`), hands the tile back to what the plugin reports.
watch(
  () => [props.data, props.dataUpdatedAt],
  () => {
    settled.clear();
    refused.clear();
  }
);

function dataState(item) {
  return STATES.has(item.state) ? item.state : "unavailable";
}

function current(item) {
  if (refused.has(item.id)) return "unavailable";
  return settled.get(item.id) ?? dataState(item);
}

function shown(item) {
  return pending.get(item.id) ?? current(item);
}

function pressed(item) {
  const state = shown(item);
  if (state === "on") return "true";
  if (state === "off") return "false";
  return undefined;
}

function inert(item) {
  return pending.has(item.id) || shown(item) === "unavailable" || !validAction(item.action);
}

function validAction(action) {
  return Boolean(action && typeof action === "object" && typeof action.name === "string");
}

function stateWords(item) {
  if (pending.has(item.id)) return PENDING_WORDS[pending.get(item.id)];
  if (refused.has(item.id)) return REFUSED;
  return WORDS[shown(item)];
}

// The same words twice in a row (two 429s) must be announced twice: clear the
// note, let the live region render empty, then set it again.
async function setNote(text) {
  clearTimeout(noteTimer);
  const repeat = Boolean(text) && note.value === text;
  note.value = "";
  noteTimer = null;
  const stamp = ++noteStamp;
  if (!text) return;
  if (repeat) await nextTick();
  if (stamp !== noteStamp) return;
  note.value = text;
  noteTimer = setTimeout(() => (note.value = ""), NOTE_MS);
}

function errorCode(error) {
  const body = error?.response?.data;
  return body?.detail?.code ?? body?.code ?? null;
}

function failureWords(error) {
  const status = error?.response?.status;
  const code = errorCode(error);
  // The plugin writes these words for the screen; pass them through (B1).
  if (code === "plugin_action_failed") {
    const message = pluginMessage(error);
    if (message) return message;
  }
  if (code === "action_busy") return BUSY;
  if (code === "rate_limited" || status === 429) return RATE_LIMITED;
  if (code === "plugin_action_timeout" || status === 504) return TIMED_OUT;
  if (NOT_USABLE_CODES.has(code) || status === 422 || status === 404 || status === 409) {
    return NOT_USABLE;
  }
  return props.schema.unreachable_text || "Couldn't reach it.";
}

// The action route sends the plugin's own message in `detail.message` for both
// a failed action and a refused one. Only a non-empty string is usable.
function pluginMessage(error) {
  const message = error?.response?.data?.detail?.message;
  return typeof message === "string" && message.trim() ? message : "";
}

async function tap(item) {
  if (inert(item)) return;
  const id = item.id;
  const target = current(item) === "on" ? "off" : "on";
  pending.set(id, target);
  try {
    const result = await props.runAction(item.action);
    const answered = result?.item;
    // Settle only on a state the plugin reported. Without one, show the data:
    // the follow-up refetch corrects it, while a guessed target could stay
    // forever if that refetch brings identical data (same object, no update).
    if (answered && answered.id === id && STATES.has(answered.state)) {
      settled.set(id, answered.state);
    } else {
      settled.delete(id);
    }
    setNote("");
  } catch (error) {
    if (error?.response?.status === 403 && errorCode(error) === "plugin_action_refused") {
      refused.add(id);
      setNote(`${item.label}: ${pluginMessage(error) || REFUSED}`);
    } else {
      setNote(`${item.label}: ${failureWords(error)}`);
    }
  } finally {
    pending.delete(id);
  }
}

onBeforeUnmount(() => clearTimeout(noteTimer));
</script>

<style scoped>
.switch-grid {
  display: flex;
  flex-direction: column;
  gap: var(--gap-group);
}

.switch-grid__group {
  display: flex;
  flex-direction: column;
  gap: var(--gap-inline);
}

.switch-grid__heading {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 0.8em;
  font-weight: var(--weight-strong);
  color: var(--ink-2);
}

.switch-grid__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--switch-tile-min), 1fr));
  gap: var(--gap-stack);
}

/* The tile is this renderer's own control (a plugin body, like CardGrid's
   rows), built from role tokens: off is the plain surface, on is the
   doctrine's "Selected / on" treatment, unavailable is the disabled one. The
   state is always in words too, never colour alone. */
.switch-tile {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--gap-inline);
  min-width: var(--touch-target);
  min-height: var(--switch-tile-h);
  padding: var(--gap-3) var(--gap-4);
  font: inherit;
  text-align: left;
  color: var(--ink);
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  cursor: pointer;
  touch-action: manipulation;
  transition:
    background-color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}

.switch-tile:hover {
  background: color-mix(in srgb, var(--ink) 4%, var(--bg-2));
}

.switch-tile:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.switch-tile--on,
.switch-tile--on:hover {
  background: color-mix(in srgb, var(--focus) 16%, var(--bg-2));
  border-color: var(--focus);
}

.switch-tile[aria-busy="true"] {
  cursor: progress;
}

.switch-tile--unavailable {
  cursor: not-allowed;
}

.switch-tile--unavailable:hover {
  background: var(--bg-2);
}

/* "Not responding" is a status people read from across the room, not a
   disabled control: no opacity (it took the words to 2.1:1). --ink-3 gives
   5.2:1 light and 4.5:1 Backlit. */
.switch-tile--unavailable .switch-tile__label,
.switch-tile--unavailable .switch-tile__state {
  color: var(--ink-3);
}

.switch-tile__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--gap-inline);
}

.switch-tile__label {
  font-size: 1em;
  font-weight: var(--weight-strong);
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.switch-tile__state {
  font-size: 0.9em;
  color: var(--ink-2);
}

.switch-tile--on .switch-tile__state,
.switch-tile[aria-busy="true"] .switch-tile__state {
  color: var(--ink);
}

/* The lamp: filled when on, hollow when off, dashed while a tap is on its way,
   dotted when the device can't be switched. Decorative; the words carry it. */
.switch-tile__lamp {
  flex: none;
  width: 0.875em;
  height: 0.875em;
  margin-top: 0.2em;
  border: 2px solid var(--ink-3);
  border-radius: var(--radius-round);
}

.switch-tile--on .switch-tile__lamp {
  background: var(--focus);
  border-color: var(--focus);
}

.switch-tile[aria-busy="true"] .switch-tile__lamp {
  background: transparent;
  border-style: dashed;
}

.switch-tile--unavailable .switch-tile__lamp {
  border-style: dotted;
}

/* Windows High Contrast flattens the on background and lamp fill; a thicker
   border and a CanvasText lamp keep "on" visible next to "off". The words
   already carry the state. */
@media (forced-colors: active) {
  .switch-tile--on {
    border-width: 3px;
  }

  .switch-tile--on .switch-tile__lamp {
    background: CanvasText;
  }
}
</style>
