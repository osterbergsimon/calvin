# MCP server (AI assistants)

Calvin has a built-in [Model Context Protocol](https://modelcontextprotocol.io) server, so an
AI assistant such as Claude Code or Claude Desktop can look at and manage your dashboard. It
speaks the streamable HTTP transport at:

```
https://<calvin>/api/mcp
```

Use `http://calvin.local:8000/api/mcp` (your own host and port) when Calvin is served over
plain HTTP on the LAN. Nothing needs installing; the server starts with the backend.

## 1. Create an API key

The server accepts only [API keys](../configuration/ADMIN_AUTH.md#api-keys). There is no
anonymous access and the admin cookie is not accepted.

1. Open **Settings › Security › API keys** (sign in with the admin password).
2. Choose a name (for example `claude`) and a scope, then create the key.
3. Copy the `clv_...` secret now. It is shown only once.

Pick the lowest scope that does the job. Scopes form a ladder (`host` ⊇ `admin` ⊇ `read`).
Each tool needs one, and a call above the key's scope returns a clear error:

| Scope | Tools |
|---|---|
| `read` | `get_status`, `list_calendar_sources`, `list_events`, `list_photos`, `list_pages`, `list_kiosks`, `list_plugins` |
| `admin` | everything in `read`, plus `add_calendar_source`, `remove_calendar_source`, `refresh_calendars`, `upload_photo`, `set_kiosk_override` |
| `host` | everything in `admin`, plus `display_power` |

`display_power` acts on the machine Calvin runs on, so it also needs
[`CALVIN_HOST_CONTROL`](../configuration/HOST_CONTROL.md) to be on, exactly like the HTTP
routes. Rebooting, restarting and updating are not exposed over MCP.

## 2. Connect a client

### Claude Code

```bash
claude mcp add --transport http calvin https://calvin.example/api/mcp \
  --header "Authorization: Bearer clv_YOUR_KEY_HERE"
```

Add `--scope user` to make it available in every project. Run `claude mcp list` to check
that it connects.

### Claude Desktop

Claude Desktop reaches remote servers through the `mcp-remote` bridge. Add this to
`claude_desktop_config.json` (Settings › Developer › Edit Config) and restart the app:

```json
{
  "mcpServers": {
    "calvin": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://calvin.example/api/mcp",
        "--header",
        "Authorization: Bearer ${CALVIN_KEY}"
      ],
      "env": { "CALVIN_KEY": "clv_YOUR_KEY_HERE" }
    }
  }
}
```

For a plain-HTTP LAN address add `--allow-http` to `args`.

Revoke the key in Settings › Security › API keys to cut an assistant off; it takes effect on
the very next request.

## Tools

Results are compact JSON. "Page" means a dashboard screen layout.

| Tool | Scope | What it does |
|---|---|---|
| `get_status` | read | Health, versions, deployment, whether host control is on |
| `list_calendar_sources` | read | Calendars (feed URLs are never returned) |
| `list_events` | read | Events in a date range (`start`, `end` ISO dates; default next 7 days, max 93; at most 200 returned) |
| `list_photos` | read | Photo count and the first `limit` (max 200) |
| `list_pages` | read | Dashboard pages and the kind of each region |
| `list_kiosks` | read | Known kiosks with their overrides |
| `list_plugins` | read | Plugin types and whether they are enabled |
| `add_calendar_source` | admin | Add an iCal feed (`name`, `ical_url`, optional `type`, `color`); the URL is checked first |
| `remove_calendar_source` | admin | Remove a calendar by id |
| `refresh_calendars` | admin | Clear the calendar cache and re-fetch |
| `upload_photo` | admin | Add a photo from `data_base64` + `filename`, or from an http(s) `url`. Same limits as the web upload: jpg, png, webp, gif, 10 MB |
| `set_kiosk_override` | admin | Per-kiosk `orientation` (`landscape`/`portrait`), boot `page` id, `osk_mode` (`auto`/`on`/`off`); `clear` returns a setting to the global value |
| `display_power` | host | Turn the display `on` or `off` |

## Notes

- Every request needs `Authorization: Bearer clv_...`. A missing, unknown or revoked key
  answers `401`; failed attempts are rate limited per IP like the rest of the API.
- Tools call Calvin's own services directly, so validation matches the web UI.
- `upload_photo` with a `url` downloads it from the Calvin machine. Only give an `admin` key to
  assistants you trust with that.
