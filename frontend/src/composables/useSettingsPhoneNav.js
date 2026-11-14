import { computed, inject, provide, ref } from "vue";

// Settings on a phone is a stack of pages instead of the desktop's rail + pane:
//
//   /settings                                         the category list
//   /settings?category=screens                        one category
//   /settings?category=screens&screen=hallway-pi      one screen
//   /settings?...&section=screen-look                 one section of that screen
//
// Every level is in the URL, so the phone's own back gesture works, a level
// can be linked to, and a reload stays where it was. Opening a level pushes a
// history entry; "back" in the top bar pops it when the previous entry is the
// level above, and otherwise replaces (a deep link has nothing to pop to).

const KEY = "settingsPhoneNav";

// Deepest last. `setting` (a search or ?setting= deep link) belongs to the
// category level and is dropped when the person moves anywhere else.
export const PHONE_NAV_LEVELS = ["category", "screen", "section"];

// Provided as "settingsSectionFocus" by a page that lists its sections on a
// phone: every SettingsSection hides and only the list shows.
export const SECTION_FOCUS_INDEX = "__index__";

export function upQuery(query) {
  const next = { ...query };
  delete next.setting;
  for (let i = PHONE_NAV_LEVELS.length - 1; i >= 0; i -= 1) {
    const key = PHONE_NAV_LEVELS[i];
    if (next[key] !== undefined) {
      delete next[key];
      break;
    }
  }
  return next;
}

// A query with `patch` applied at its level: the levels above are kept, the
// levels below are dropped (opening another screen closes its section).
export function openQuery(query, patch) {
  const deepest = Math.max(...Object.keys(patch).map(key => PHONE_NAV_LEVELS.indexOf(key)));
  const next = {};
  for (const [key, value] of Object.entries(query)) {
    const level = PHONE_NAV_LEVELS.indexOf(key);
    if (key === "setting") continue;
    if (level === -1 || level < deepest) next[key] = value;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && value !== undefined && value !== "") next[key] = value;
  }
  return next;
}

export function provideSettingsPhoneNav({ active, route, router }) {
  // A child page (a screen, a section) names itself here; the top bar shows it.
  const titles = ref({});

  const open = (patch, { replace = false } = {}) => {
    if (!active.value) return;
    const query = openQuery(route.query, patch);
    return replace ? router.replace({ query }) : router.push({ query });
  };

  const up = () => {
    const query = upQuery(route.query);
    const target = router.resolve({ path: route.path, query }).fullPath;
    const back = typeof window !== "undefined" ? window.history.state?.back : null;
    if (back === target) return router.back();
    return router.replace({ query });
  };

  const setTitle = (level, text) => {
    titles.value = { ...titles.value, [level]: text || "" };
  };

  const nav = {
    active,
    open,
    up,
    setTitle,
    titles,
    query: computed(() => route.query),
  };
  provide(KEY, nav);
  return nav;
}

export function useSettingsPhoneNav() {
  return inject(KEY, null);
}
