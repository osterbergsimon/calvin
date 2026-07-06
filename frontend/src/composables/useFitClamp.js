import { ref, unref } from "vue";
import { useResizeObserver } from "@vueuse/core";

// Pure: given item bounds along the clamp axis (in DOM order), group them into
// tracks by shared `start` (rows of a grid / individual items of a strip), then
// return the boundary of the last track that fully fits `containerSize`.
// Never returns an empty result when items exist — the first track always shows
// so a too-small region degrades to "one partial track" instead of blank.
export function computeFitBoundary(itemBounds, containerSize, epsilon = 1) {
  if (!itemBounds || itemBounds.length === 0) {
    return { fits: 0, fitCount: 0, hasOverflow: false, trackCount: 0 };
  }
  // Group into tracks by start offset (within epsilon).
  const tracks = [];
  for (const b of itemBounds) {
    const last = tracks[tracks.length - 1];
    if (last && Math.abs(b.start - last.start) <= epsilon) {
      last.end = Math.max(last.end, b.end);
      last.count += 1;
    } else {
      tracks.push({ start: b.start, end: b.end, count: 1 });
    }
  }
  let fitTracks = 0;
  let fitCount = 0;
  for (const t of tracks) {
    if (t.end <= containerSize + epsilon) {
      fitTracks += 1;
      fitCount += t.count;
    } else {
      break;
    }
  }
  // Never blank: always show at least the first track.
  // When forced to show a track that itself overflows, hasOverflow is still true.
  const forcedFirstTrack = fitTracks === 0;
  if (forcedFirstTrack) {
    fitTracks = 1;
    fitCount = tracks[0].count;
  }
  return {
    fits: tracks[fitTracks - 1].end,
    fitCount,
    hasOverflow: forcedFirstTrack || fitTracks < tracks.length,
    trackCount: tracks.length,
  };
}

// Composable: measures `containerRef`'s children (`itemSelector`) along `axis`
// and exposes reactive clamp outputs. vueuse's useResizeObserver owns the
// observer lifecycle; this stays a thin measurement layer.
export function useFitClamp(containerRef, { axis = "block", itemSelector, isTouch: _isTouch }) {
  const fits = ref(0);
  const fitCount = ref(0);
  const hasOverflow = ref(false);

  const recompute = () => {
    const el = unref(containerRef);
    if (!el) return;
    const crect = el.getBoundingClientRect();
    const containerSize = axis === "inline" ? crect.width : crect.height;
    const items = Array.from(el.querySelectorAll(itemSelector));
    const bounds = items.map(it => {
      const r = it.getBoundingClientRect();
      if (axis === "inline") {
        return { start: r.left - crect.left, end: r.right - crect.left };
      }
      return { start: r.top - crect.top, end: r.bottom - crect.top };
    });
    const res = computeFitBoundary(bounds, containerSize);
    // Guard against observer feedback loops: only write on change.
    if (res.fits !== fits.value) fits.value = res.fits;
    if (res.fitCount !== fitCount.value) fitCount.value = res.fitCount;
    if (res.hasOverflow !== hasOverflow.value) hasOverflow.value = res.hasOverflow;
  };

  useResizeObserver(containerRef, recompute);

  return { fits, fitCount, hasOverflow, recompute };
}
