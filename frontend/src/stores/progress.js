import { defineStore } from "pinia";
import { ref, computed } from "vue";

/**
 * Ambient work-progress state, feeding the perimeter focus-light comet.
 *
 * Keyed by source id on purpose: the global comet runs while *any* source is
 * active, but the same registry lets a future per-region indicator subscribe to
 * just its own id (e.g. `region:<id>` or `plugin:<id>`) without a refactor. A
 * source reports either `null` (indeterminate — unknown duration) or a 0..1
 * number (determinate — reserved for the corner→corner fill mode).
 */
export const useProgressStore = defineStore("progress", () => {
  // Vue 3 reactive collections track set/delete, so mutating this Map re-runs
  // the getters below without a manual version bump.
  const sources = ref(new Map());

  const begin = (id, { determinate = false } = {}) => {
    sources.value.set(id, determinate ? 0 : null);
  };

  const setProgress = (id, value) => {
    if (!sources.value.has(id)) return;
    sources.value.set(id, Math.max(0, Math.min(1, value)));
  };

  const end = id => {
    sources.value.delete(id);
  };

  // True while any source is doing work → the comet orbits.
  const active = computed(() => sources.value.size > 0);
  const activeIds = computed(() => Array.from(sources.value.keys()));
  const isActive = id => sources.value.has(id);

  // Overall progress only when *every* active source reports a number; a single
  // indeterminate source makes the whole thing indeterminate. Reserved for the
  // determinate fill mode — the comet ignores this until that lands.
  const progress = computed(() => {
    const values = Array.from(sources.value.values());
    if (!values.length || values.some(v => v == null)) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  });

  // ── Playful (opt-in, stubbed) ─────────────────────────────────────────────
  // One-shot celebratory laps (day rollover, photo change) will push a
  // transient token here so the comet does a single flourish. Inert for now —
  // kept so call sites can exist before the motion does. Gated at render time
  // behind config (`perimeterProgressPlayful`, default off).
  const pulse = (_kind = "lap") => {
    /* playful-ready: intentionally a no-op until the flourish is wired */
  };

  return { begin, end, setProgress, pulse, active, activeIds, isActive, progress };
});
