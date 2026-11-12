// Dev-only entry for the UI gallery (see /ui-gallery.html).
import { createApp } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import "../styles/main.css";
import "../styles/theme.css";
import "../styles/fonts.js";
import "../styles/base.css";
import UiGallery from "./UiGallery.vue";

// ListRowLink is a RouterLink: give the gallery a router that goes nowhere.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/:any(.*)*", component: { render: () => null } }],
});

createApp(UiGallery).use(router).mount("#gallery");
