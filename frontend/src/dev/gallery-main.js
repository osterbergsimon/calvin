// Dev-only entry for the renderer gallery (see /renderer-gallery.html).
import { createApp } from "vue";
import { createPinia } from "pinia";
import "../styles/main.css";
import "../styles/theme.css";
import "../styles/fonts.js";
import "../styles/base.css";
import RendererGallery from "./RendererGallery.vue";

// Renderers draw their empty states through ui/EmptyState, which reads the
// config/mode stores — the gallery needs an active pinia like the app has.
createApp(RendererGallery).use(createPinia()).mount("#gallery");
