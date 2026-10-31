# Plugin copy, labels and icons (CLV-85)

Status: spec for one calvin-plugins lane. Source: `calvin-plugins` `origin/main` (209ff2b), the `PluginMetadata(...)` in
each `plugin.py`, read with `ast`. Renderer contract: CLV-74 (`label` = field label; `description` = the hint under
the field; `hidden` skipped). Copy rules: settings audit §5 and the no-developer-words table (#193).
`midnight-theme` 2.0.0 is in the themes audit §4 and isn't repeated here.

## 1. Findings

- **No field in any of the 14 plugins sets `label`** (54 fields). Every form shows the description as the label, the
  hint line is empty, and some descriptions are long sentences with URLs and defaults in them.
- **Nothing is `required`**, so a form saves without its address or API key and then fails later.
- **Names and descriptions mix styles**: "Mealie Meal Plan", "Email (IMAP)", "Yr.no Weather", URLs inside descriptions,
  and "Demonstrates event system usage".
- **No plugin sets `icon`**. The contract only allows an emoji or an image file. Emoji render differently per OS and
  kiosk font (the frontend audit counted 17 emoji-as-icon in the host).
- **`test-plugin` and `test-plugin-frontend` are in the catalog.** A family would see "Test Plugin" in "Add a web
  page or app".
- **`instance_label`** (used in "Add {label}" titles) is Title Case or missing.

## 2. Decisions (owner approved P1 and P2, 2026-10-31)

- **P1. Icons are mdi names** (recommended): `icon: "mdi:<name>"`. The host resolves it from a **curated map** in
  `frontend/src/utils/pluginIcon.js` (about 30 names, imported individually from `@mdi/js`, so the bundle grows by a
  few KB rather than the whole set). An unknown name or an emoji falls back to the first letter, as today. A plugin
  that needs its own mark may still ship `frontend/icon.svg`, monochrome and drawn with `currentColor`. This is a
  small host change in the same lane as the plugin edits.
- **P2. Test plugins leave the catalog** (recommended): `plugins.json` marks them `"catalog": false`. They stay
  installable from the repo for development, and the catalog list filters them out.

## 3. Names, descriptions, icons, instance labels

Description = one sentence for the picker tile: what you see and what it needs. No URLs, no "Calvin", no brand
claims.

| Plugin | `name` | `description` | `icon` | `instance_label` |
|---|---|---|---|---|
| chromecast | **Chromecast** | What's playing on a Chromecast or Google speaker. | `mdi:cast` | speaker |
| image-processor | **Photo resizer** | Shrinks large uploaded photos and makes thumbnails. | `mdi:image-auto-adjust` | (none; single instance) |
| imap | **Photos from email** | Saves photo attachments from an email inbox to Local photos. | `mdi:email-outline` | email account |
| immich | **Immich** | Albums from your Immich photo server. | `mdi:image-multiple` | Immich album |
| lychee | **Lychee** | Albums from your Lychee photo server. | `mdi:folder-image` | Lychee album |
| mealie | **Mealie** | This week's meal plan from your Mealie server. | `mdi:silverware-fork-knife` | Mealie server |
| nasa-apod | **NASA picture of the day** | NASA's astronomy picture of the day, plus past ones. | `mdi:telescope` | (none) |
| picsum | **Random photos** | Random photos from Picsum. Nothing to set up. | `mdi:shuffle-variant` | (none) |
| sl_departures | **SL departures** | Next departures from a Stockholm public transport stop. | `mdi:bus-clock` | stop |
| system-monitor | **System monitor** | CPU, memory, disk and temperature of the Calvin server. | `mdi:gauge` | (none) |
| test-plugin | Test plugin | For plugin developers: checks that installing works. | `mdi:flask-outline` | (none) (P2: not in catalog) |
| test-plugin-frontend | Test plugin with a page | For plugin developers: checks installing a plugin with its own page. | `mdi:flask-outline` | (none) (P2) |
| unsplash | **Unsplash** | Popular photos from Unsplash. Needs a free Unsplash API key. | `mdi:camera-outline` | (none) |
| yr_weather | **Weather (Yr)** | Weather and forecast from the Norwegian Meteorological Institute. | `mdi:weather-partly-cloudy` | place |

`instance_label` is a lowercase noun phrase. The host capitalises the title ("Add Immich album") and uses it as is in
sentences.

## 4. Fields: label · hint · notes

The hint is optional, one sentence, ending with a full stop. Units go in the hint when the control can't show them.
"req" = add `required: true`. Values in `ui.options` keep their labels unless listed.

### chromecast
| Field | `label` | `description` (hint) | Notes |
|---|---|---|---|
| device_name | Speaker or TV | The name it has in the Google Home app. | req |
| discovery_timeout | Search time | Seconds to look for it on the network. | `hidden: true` (advanced; default 5) |

### image-processor
| Field | `label` | hint | Notes |
|---|---|---|---|
| processing_enabled | Process new photos | — | |
| resize_enabled | Shrink large photos | — | |
| max_width | Largest width | In pixels. | |
| max_height | Largest height | In pixels. | |
| generate_thumbnails | Make thumbnails | — | |
| thumbnail_size | Thumbnail size | In pixels. | |

### imap
| Field | `label` | hint | Notes |
|---|---|---|---|
| email_address | Email address | The inbox to check for photos. | req |
| email_password | Password | For Gmail and Outlook, use an app password. | req |
| imap_server | Mail server | For example imap.gmail.com. | req |
| imap_port | Port | Usually 993. | |
| check_interval | Check every | In seconds; 300 is 5 minutes. | unit stays seconds (no config migration) |
| target_directory | Save to folder | Leave empty to use Local photos. | `hidden: true` (advanced) |
| mark_as_read | Mark emails as read | — | |

### immich
| Field | `label` | hint | Notes |
|---|---|---|---|
| url | Server address | For example https://photos.example.com. | req |
| api_key | API key | In Immich: your profile → API keys. | req |
| album_id | Album ID | Leave empty for photos from your whole library. | |
| count | Photos to show | How many to rotate through. | |

### lychee
| Field | `label` | hint | Notes |
|---|---|---|---|
| url | Server address | For example https://photos.example.com. | req |
| api_key | API token | In Lychee: Settings → Security → API keys. | |
| album_id | Album ID | Leave empty for all photos you can see. | |

### mealie
| Field | `label` | hint | Notes |
|---|---|---|---|
| mealie_url | Server address | For example http://mealie.local:9000. | req |
| api_token | API token | In Mealie: your profile → API tokens. | req |
| group_id | Group | Leave empty for your own group. | `hidden: true` (advanced) |
| days_ahead | Days to show | How many days of the meal plan, from today. | |
| fullscreen | Open full screen | Shows the meal plan full screen when chosen. | |

### nasa-apod
| Field | `label` | hint | Notes |
|---|---|---|---|
| api_key | API key | Optional. Without one, NASA limits how often Calvin can ask. | |
| count | Pictures to show | 1 to 100. | |

### picsum
| Field | `label` | hint | Notes |
|---|---|---|---|
| count | Photos to show | 1 to 100. | |

### sl_departures
| Field | `label` | hint | Notes |
|---|---|---|---|
| stop_name | Stop | Type the stop's name, then choose Test connection, or set a Stop ID. | optional: either this or site_id (validate_config) |
| site_id | Stop ID | Filled in by Test connection. | keep visible; read-only after Test if the renderer supports `readonly` |
| lines | Lines | Only these lines, separated by commas. Empty shows all. | |
| modes | Transport types | Only these: bus, metro, train, tram, ship. Empty shows all. | should become a multi-select (`ui.component: "multiselect"`) when the renderer has one |
| direction | Direction | Usually Any; SL's direction numbers differ per line. | moves `ui.help_text` into `description`; option "Direction 1/2" stays |
| max_departures | Departures to show | — | |
| forecast_minutes | Look ahead | Minutes ahead to include. | |
| clockbar_show_following | Show the next departure too | In the clock bar. | |

### system-monitor
| Field | `label` | hint | Notes |
|---|---|---|---|
| show_temperature | Show temperature | — | |
| show_network | Show network speed | — | |
| temp_unit | Temperature unit | — | options "Celsius (°C)" / "Fahrenheit (°F)" stay |
| show_in_statusbar | Show in the clock bar | CPU and memory, in short. | |

### test-plugin, test-plugin-frontend
| Field | `label` | hint |
|---|---|---|
| message | Message | Text the test shows. |

### unsplash
| Field | `label` | hint | Notes |
|---|---|---|---|
| api_key | API key | Free from Unsplash's developer site. | req |
| category | Which photos | — | options Popular / Latest / Oldest stay |
| count | Photos to show | 1 to 100. | |

### yr_weather
| Field | `label` | hint | Notes |
|---|---|---|---|
| location | Place | A town, city or address, or set the coordinates below instead. | optional: either this or latitude + longitude (validate_config) |
| latitude | Latitude | Filled in from Place; change only to be exact. | |
| longitude | Longitude | Filled in from Place; change only to be exact. | |
| altitude | Altitude | In metres. Leave 0 if you don't know. | `hidden: true` (advanced) |
| forecast_days | Days to show | 1 to 9. | |
| fullscreen | Open full screen | Shows the forecast full screen when chosen. | |
| show_in_statusbar | Show in the clock bar | The temperature now. | |

## 5. Repo rules (calvin-plugins CI)

Extend `test_validate_plugins.py` so this can't drift:
- every `instance_config_schema` field has a non-empty `label` in sentence case (first letter upper, no Title Case
  words except proper nouns from an allowlist: Immich, Lychee, Mealie, NASA, SL, Unsplash, Yr, Gmail, Outlook,
  Google, Chromecast, ID, API);
- `description`, if present, is ≤ 120 characters, ends with a full stop, and has no `http`;
- `name` is ≤ 28 characters; `description` (plugin) is one sentence, ≤ 90 characters, no `http`;
- `icon` matches `^mdi:[a-z0-9-]+$` and is in the host's curated list (the list is mirrored in the test);
- catalog entries with `"catalog": false` are excluded from the published list.

Bump each touched plugin's patch version (copy-only changes are not breaking). The host map for P1 lands in the same
lane as one small calvin PR.
