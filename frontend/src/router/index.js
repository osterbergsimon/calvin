import { createRouter, createWebHistory } from "vue-router";

// Lazy load routes for better code splitting
const Dashboard = () => import("../views/Dashboard.vue");
const Settings = () => import("../views/Settings.vue");

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
  ],
});

export default router;
