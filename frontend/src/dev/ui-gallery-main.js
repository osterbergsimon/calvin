// Dev-only entry for the UI gallery (see /ui-gallery.html).
import { createApp } from "vue";
import "../styles/main.css";
import "../styles/theme.css";
import "../styles/fonts.js";
import "../styles/base.css";
import UiGallery from "./UiGallery.vue";

createApp(UiGallery).mount("#gallery");
