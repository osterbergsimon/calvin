// Canonical registry of supported display_schema.kind values and their
// matching Vue renderers.
//
// This list MUST stay in sync with `SUPPORTED_DISPLAY_KINDS` in
// backend/app/plugins/definitions.py — the backend rejects any plugin whose
// `display_schema.kind` is not in that set, and the kind-sync test
// (backend/tests/unit/test_display_kind_sync.py) fails the build if the two
// lists drift.
//
// Adding a renderer:
//   1. Add the component file under ./renderers/
//   2. Register it here under its kind string.
//   3. Add the same kind string to SUPPORTED_DISPLAY_KINDS in definitions.py.

import Status from "./renderers/Status.vue";
import CardGrid from "./renderers/CardGrid.vue";
import ItemList from "./renderers/ItemList.vue";
import IframeRenderer from "./renderers/IframeRenderer.vue";
import ImageWithCaption from "./renderers/ImageWithCaption.vue";
import MetricDashboard from "./renderers/MetricDashboard.vue";
import WeatherForecast from "./renderers/WeatherForecast.vue";
import WebComponentHost from "./WebComponentHost.vue";

export const renderers = {
  status: Status,
  "card-grid": CardGrid,
  iframe: IframeRenderer,
  "item-list": ItemList,
  "image-with-caption": ImageWithCaption,
  "metric-dashboard": MetricDashboard,
  "weather-forecast": WeatherForecast,
  "web-component": WebComponentHost,
};

export const SUPPORTED_DISPLAY_KINDS = Object.freeze(Object.keys(renderers));

// Statusbar items have their own (smaller) kind namespace — a statusbar item
// is a compact strip, not a full panel. Mirrors SUPPORTED_STATUSBAR_KINDS in
// backend/app/plugins/definitions.py (also covered by the kind-sync test).
export const SUPPORTED_STATUSBAR_KINDS = Object.freeze(["status"]);
