import { createRouter, createWebHistory } from "vue-router";
import { recoverFromChunkLoadError } from "./chunkRecovery";

// Lazy load routes for better code splitting
const Dashboard = () => import("../views/Dashboard.vue");
const Settings = () => import("../views/Settings.vue");
const GuestShare = () => import("../views/GuestShare.vue");

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "dashboard",
      component: Dashboard,
    },
    {
      path: "/settings",
      name: "settings",
      component: Settings,
    },
    {
      // Trailing slash optional: the installed PWA's scope is /share/<token>/.
      path: "/share/:token/",
      name: "guest-share",
      component: GuestShare,
      meta: { guest: true },
    },
  ],
});

// A stale client (a page left open across a deploy) cannot load a route's
// hashed chunk, and Vue Router would abort the navigation silently — clicking
// ⋯ › Settings then does nothing at all. Fall back to a full navigation, which
// is exactly the address-bar path that works (CLV-28).
router.onError((error, to) => {
  recoverFromChunkLoadError(error, to);
});

export default router;
