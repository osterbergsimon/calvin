// Dev-only entry for the renderer gallery (see /renderer-gallery.html).
import { createApp } from "vue";
import "../styles/main.css";
import "../styles/theme.css";
import "../styles/fonts.js";
import "../styles/base.css";
import RendererGallery from "./RendererGallery.vue";

createApp(RendererGallery).mount("#gallery");
