import { RELOAD_SOURCE_ID, useProgressStore } from "../stores/progress";

/**
 * Reload this page with the app loading light on (CLV-115).
 *
 * Reload UI and a service-worker update both go through here. The browser
 * keeps the old page up until the new one answers, so the light covers the
 * wait from the tap until the new page is up; the new page's first-load light
 * takes over from there on the dashboard. The store's 60 s cap ends it if the
 * reload never happens.
 */
export function reloadWithLight({
  progress = useProgressStore(),
  reload = () => window.location.reload(),
} = {}) {
  progress.begin(RELOAD_SOURCE_ID);
  reload();
}
