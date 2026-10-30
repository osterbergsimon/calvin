# Content and plugins: one place for every source

Status: spec. Mockup: [mocks/content-plugins/content-plugins.html](mocks/content-plugins/content-plugins.html),
PNGs `mocks/content-plugins/png/p1.png` … `p3.png`. Frontend only, except §6. Same shape of fix as
[2026-10-30-screens-and-kiosks-setup.md](2026-10-30-screens-and-kiosks-setup.md): give each thing one home.

## 1. The jobs, and how they go today

| Job | Today |
|---|---|
| Add a Google/iCal calendar | Content › Calendars: its own inline form (Type, Name, URL). Plugins › the calendar plugin card only says **Manage calendar sources** |
| Add Immich photos | Content › Image sources has **Add photos** (upload) and a drag-to-order list, but no add. Go to Plugins › Installed › filter Image › Immich card › **+ Add {label}** → modal |
| Edit or remove that Immich source | Plugins only. Content lists it but only lets you drag it |
| Add a web page | Content › Web pages: **Add a web page** opens the modal of *the first enabled service plugin*. With Mealie enabled first, that's Mealie's form (`AddWebPageButton.vue`: `plugins.find(p => p.type === "service" && p.enabled)`) |
| Add Mealie recipes | Plugins › Service › Mealie card › add. It then appears in Content › Web pages & services, drag only |
| Weather in the clock bar | Install/enable in Plugins, add it there, then Dashboard › Clock bar items to show its tile, plus **Show plugin info** on |
| Install a plugin | Plugins › Install: type a GitHub URL and branch, **List Plugins**, tick, install. Nothing is prefilled. A **⚠️ Server Restart Required** box with `sudo systemctl restart calvin-backend` can still show, though installs are live |

## 2. Findings

1. **A source has two homes.** Calendars are managed in Content. Photo sources and web pages are listed in Content
   but managed in Plugins. Every plugin card in Plugins also lists its own sources. So you look in two places,
   and each place has only half the actions.
2. **Three different add flows** for the same idea: a custom calendar form, an "Add a web page" shortcut that
   picks an arbitrary service plugin (a real bug), and the plugin card's **+ Add** for everything else.
3. **You add by plugin, but you think by what you want to see.** "I want photos from Immich" means knowing that
   Immich is an *image plugin*, finding its card under a type filter, and adding there.
4. **Plugin-engine words reach the family:** "Instance Name" (the modal's name field), the type badge
   `image`/`service`/`backend`, "Installed Plugins", "statusbar", "List Plugins".
5. **Installing assumes a developer.**
   - It's GitHub-URL first, with no default catalog.
   - The restart notice contradicts live install (CLAUDE.md: "Install is live — no restart").
   - "Local path" is a dev-mode option, so it's fine where it is.
6. **The ordering lists look like the main thing.** In Content › Image sources and Web pages, the only control is a
   drag handle. That makes order look like the main setting, while add/edit/remove live elsewhere.

## 3. Proposal

### 3.1 Content owns every source

**Rule: a source (a plugin instance) is added, edited, turned on/off, ordered and removed only in Content.**
Plugins never lists sources.

Content sections become one per thing you see, in this order:

1. **Calendars**: calendar sources + **Calendar display** (unchanged rows from the audit).
2. **Photos**: photo sources (Local photos with **Add photos** upload, Immich, …) + the photo rows (Show each photo
   for, Fit photos, Shuffle, Photo frame when idle).
3. **Web pages & apps**: every service source (iframe pages, Mealie, Home Assistant cards, …).
4. **Clock bar info**: sources whose plugin only has a clock-bar tile (weather, …). The Dashboard › Clock bar items
   list stays as the *show/hide and order* control and links here for adding. (A service source with both a page
   and a tile lists under Web pages & apps, and its tile shows in Clock bar items.)

**Every section has the same list** (mock P1), built as one component, `SourceList.vue`, for all four:
- A row per source:
  - drag handle (only where order matters: Photos rotation, Web pages & apps; not Calendars, which merge);
  - status dot (running / error / off), using the existing `running` field;
  - **name**, and under it **{provider} · {summary}**, e.g. "Immich · 2 albums", "Google Calendar · Family",
    using `getInstanceSummary`;
  - Calendars only: the colour swatch;
  - an enabled toggle;
  - **Edit**, which opens `InstanceModal`;
  - **⋯** (Remove, with confirm).
- One **Add …** button per section: **Add a calendar**, **Add photos from…**, **Add a web page or app**,
  **Add clock bar info**. It opens the **provider picker** (§3.2).
- Error state on a row: `--err` dot and the summary replaced with the plugin's error text (truncated to one line,
  full text in the Edit modal).
- Empty section: the CLV-20 empty-state copy for that kind (unchanged), plus the Add button.

**Calendars switch to the shared flow.** The custom inline form (`CalendarSourcesTab.vue`) is replaced by the
provider picker + `InstanceModal` (calendar plugins already declare `instance_config_schema`). The calendar-only
row extras (colour, **Show times**) stay on the row. "Check for new events every" stays as the section's last row.

### 3.2 Provider picker

A small dialog (`DialogScrim` + panel, 30rem, mock P1 right). Title: **Add a calendar** / **Add photos from…** /
**Add a web page or app** / **Add clock bar info**.
- One tile per **enabled** plugin of that kind: plugin name, its one-line `description` from metadata, and an icon
  if the plugin ships one (otherwise its first letter on `--bg-0`). Tiles are ≥ 56px tall.
  - Photos also lists **Upload from this device** first (opens the existing PhotoUpload picker).
  - Web pages lists the iframe plugin first as **Web page (any address)**.
- Installed but turned off: tile at 55% with **Turn on** (enables the plugin, then continues).
- Footer link: **Get more in Plugins ›** (opens Plugins › Install, filtered to that kind).
- Exactly one candidate → skip the picker and open its `InstanceModal` straight away. This fixes the "Add a web
  page opens Mealie" bug by construction.
- Choosing a tile opens `InstanceModal` for that plugin. On save, it closes and the new row is highlighted (`--focus`
  outline, 1.5s).

### 3.3 Plugins is about the add-ons themselves

Plugins keeps two sections: **Installed** and **Install** (Installed first: that's the common visit).

**Installed** (mock P2): one compact card per plugin, no source lists:
- Name, a plain-word kind chip (**Calendar**, **Photos**, **Web page & app**, **Clock bar**, **Theme**,
  **Background**), and the version.
- One line: **Used by 2 sources** (a link to that Content section, with the section's rows for this provider
  highlighted), **Not used yet**, or, for themes, **Choose it in Dashboard › Appearance**.
- Enabled toggle. Turning off a plugin that has sources asks: **Turn off {name}? Its {n} sources stop showing until
  you turn it back on.**
- **Settings** (only if the plugin has plugin-level settings), **Update** when one is available, **Uninstall**.
  Uninstall with sources: **Uninstall {name}? Its {n} sources are removed too.** (`.btn-danger` **Uninstall**).
- The filter becomes the same plain kinds as the chips, with **All** first.

**Install** (mock P3):
- **From the Calvin catalog** first: the official `calvin-plugins` repository is prefilled and listed on open (no
  URL to type), with search and kind filter. Each row: name, description, kind chip, **Install** / **Installed ✓**
  / **Update**.
- **From another GitHub repository**: a collapsed disclosure with today's URL + branch fields, **List plugins**.
- **Local path**: unchanged, dev mode only.
- After install, the row offers **Add a source** (opens the provider flow for that plugin in Content).
- Remove the restart notice if the backend never sets `requiresRestart` for contract-1.0 installs (it's live). If
  there's a real remaining case (a failed live load), the copy becomes **Calvin needs a restart to finish
  installing {name}.** with the System › Restart link, and no shell command.

### 3.4 Words

- A plugin instance is a **source** everywhere. `InstanceModal` field **Instance Name** → **Name**, placeholder from
  the plugin's `instance_label` or **e.g. Family photos**. Modal title: **Add {instance_label}** / **Edit {name}**.
- Type badges never show raw types. The mapping is `calendar` → Calendar, `image` → Photos,
  `service` → Web page & app (or Clock bar when it has only a statusbar schema), `theme` → Theme,
  `backend` → Background.
- "Installed Plugins" → **Installed**. "List Plugins" → **List plugins**. "statusbar" never appears.

### 3.5 Clock bar

Dashboard › Clock bar items stays the place to show, hide and order tiles. Its empty state
(**No installed plugins expose a clock bar tile.**) becomes **No clock bar info yet.** + **Add clock bar info**
(opens §3.2 for that kind, in Content). **Show plugin info** (the audit row) is removed: each tile already has its
own toggle in Clock bar items, so the global switch only duplicates them.

### 3.6 Service sources: placed, not merged

Calendars and photos are **feeds**: every source merges into any calendar or photos region. A service source (web
page, Mealie, Home Assistant…) is **placed**: it only shows once it's put in a region (`service:{id}` in the page
editor). So adding one isn't enough on its own, and Content has to say where each one is placed.

- **Where it shows**, on each Web pages & apps row, after the summary:
  - **On Home, Week** (page names, linking to the editor on that page);
  - or **Not on any page yet** + text button **Put it on a page**.
- **Put it on a page** opens Pages & regions on the active page in *place mode*:
  - a banner **Choose a region for Recipes**;
  - tapping a region sets its content to this source (an empty region directly; a filled one asks **Replace
    {current} with Recipes?**);
  - **Cancel** leaves it unplaced.
- **After adding** a service source, the new row is highlighted and shows **Put it on a page** as a `.btn--primary`,
  so the next step is obvious.
- **Clock-bar-only sources** (a plugin with `statusbar_schema` and no `display_schema`) need no placing. On add,
  their tile is switched on in Clock bar items, and the row says **In the clock bar** or **Hidden from the clock bar**
  (with a link to Clock bar items).
- **A service with both** a page and a tile: the row shows both, e.g. **On Home · in the clock bar**.
- **Background plugins** (`backend`) have no sources. Their settings stay on their card in Plugins, which says
  **Works in the background. No sources to add.**
- **Remove** on a placed source warns: **Remove Recipes? It's on Home and Week; those regions become empty.**

### 3.7 Installing from the picker (decision D)

Installing and *managing* add-ons stays in Plugins: updates, uninstall, turning off, other repositories, local path.
*Discovering* an add-on is bridged into the picker, because "I want photos from Immich" shouldn't end at "go to
another category":

- The provider picker (§3.2) gets a second group, **From the Calvin catalog**. It lists catalog plugins of that
  kind that aren't installed: name, description, **Install**.
- **Install** asks once: **Install Immich? It adds an add-on to your Calvin server. You can remove it in Plugins.**
  (**Install** / **Cancel**). It then shows progress in the tile (**Installing…**), and on success continues straight
  into that plugin's add form. On failure the tile shows the error and **See details in Plugins ›**.
- Only the official catalog appears here. Other GitHub repositories and local paths are Plugins only: installing
  third-party code should be a deliberate visit.
- If the catalog can't be reached, the group is simply absent; **Get more in Plugins ›** stays.

## 4. Owner decisions

Approved 2026-10-30: A, B, C and D.

- **A. Sources live only in Content** (Plugins shows "Used by n sources" links, not the lists). Recommended.
- **B. Calendars use the shared add/edit flow** (retire the custom form). Recommended: one flow to learn and maintain.
- **C. Remove "Show plugin info"** in favour of the per-tile toggles. Recommended.
- **D. Install official-catalog plugins from the Content picker** (§3.7); management stays in Plugins. Recommended.

## 5. Phasing

1. **Bug + words** (no decision needed): fix `AddWebPageButton` to open the provider picker (or the iframe plugin
   when it's the only one); "Instance Name" → "Name"; plain kind chips; the restart notice check.
2. **Content owns sources** (A, B): `SourceList` + the provider picker in all four sections, placement lines and
   place mode (§3.6); Plugins cards slimmed.
3. **Install catalog-first**, the clock bar change (C) and catalog install from the picker (D, §3.7).

## 6. Data needed

- The plugin catalog: the backend already enumerates a GitHub repo (`List Plugins`). Phase 3 needs a default repo
  setting (`pluginCatalogRepo`, default the official repo) and the frontend calling enumerate on open. No new
  endpoint.
- Optional plugin icon: `PluginMetadata.icon` (a file in the plugin's `frontend/` or an emoji string). If it's
  absent, the UI uses the first letter. It's a contract addition, so it's optional and has no loader change beyond
  passing it through.

## 7. Tests (vitest), phases 1–2

- Add a web page:
  - with iframe + Mealie enabled, the picker lists both and the iframe one is first;
  - with only iframe, its modal opens directly;
  - it never opens a non-iframe plugin's modal without a choice.
- `SourceList`, for each kind:
  - rows show the provider · summary, the status dot, the toggle, Edit and Remove;
  - drag only on Photos and Web pages & apps;
  - the calendar row keeps its colour and Show times;
  - the error row shows the plugin error;
  - empty uses the CLV-20 copy plus Add.
- Provider picker:
  - lists the enabled plugins of the kind, plus Upload for Photos;
  - a disabled plugin offers **Turn on**;
  - a single candidate skips the picker;
  - "Get more in Plugins ›" deep-links with the kind filter.
- Plugins card:
  - no source lists;
  - "Used by n sources" links to the Content section with highlight;
  - the turn-off and uninstall confirms include the source count;
  - themes link to Appearance.
- Service placement: rows show the page names or **Put it on a page**; place mode sets the region content, asks before
  replacing, and Cancel changes nothing; a clock-bar-only add switches its tile on; Remove warns with the page names.
- Words: no "Instance", raw type badge or "statusbar" text in Settings.
