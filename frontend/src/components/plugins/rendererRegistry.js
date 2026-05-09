// Canonical registry of supported display_schema.kind values and their
// matching Vue renderers.
//
// This list MUST stay in sync with `SUPPORTED_DISPLAY_KINDS` in
// backend/app/plugins/definitions.py — the backend rejects any plugin whose
// `display_schema.kind` is not in that set, so a kind that exists here but
// not there will fail at plugin load.
//
// Adding a renderer:
//   1. Add the component file under ./renderers/
//   2. Register it here under its kind string.
//   3. Add the same kind string to SUPPORTED_DISPLAY_KINDS in definitions.py.

import StatusTile from "./renderers/StatusTile.vue";
import StatusList from "./renderers/StatusList.vue";
import StatusRow from "./renderers/StatusRow.vue";
import CardGrid from "./renderers/CardGrid.vue";
import ItemList from "./renderers/ItemList.vue";
import IframeRenderer from "./renderers/IframeRenderer.vue";
import ImageWithCaption from "./renderers/ImageWithCaption.vue";
import MetricDashboard from "./renderers/MetricDashboard.vue";
import WeatherForecast from "./renderers/WeatherForecast.vue";
import WebComponentHost from "./WebComponentHost.vue";

export const renderers = {
  "status-tile": StatusTile,
  "status-list": StatusList,
  "status-row": StatusRow,
  "card-grid": CardGrid,
  iframe: IframeRenderer,
  "item-list": ItemList,
  "image-with-caption": ImageWithCaption,
  "metric-dashboard": MetricDashboard,
  "weather-forecast": WeatherForecast,
  "web-component": WebComponentHost,
};

export const SUPPORTED_DISPLAY_KINDS = Object.freeze(Object.keys(renderers));
