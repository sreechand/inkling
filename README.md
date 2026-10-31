# inker-railway

A deployment-ready Docker image that extends the upstream [Inker](https://github.com/wojooo/inker) e-ink dashboard server (`wojooo/inker:0.6.0`) with build-time patches, custom plugins, and Railway-compatible hosting tweaks.
Designed to specifically work with my Kindle Voyage. 

## What it does

At image build time, `patch-inker.js` rewrites the bundled `/app/dist/main.js` to:

- **Add plugins**
  - **Todoist Tasks** — polls the Todoist `/api/v1/tasks/filter` endpoint with a configurable filter, limit, timezone, and language; renders a high-contrast task list widget.
  - **Google Calendar** — seeded from `google-calendar-plugin.json`; read-only agenda/upcoming/week/month views via OAuth with the least-privilege `calendar.events.readonly` scope.
- **Render widgets from plugin instances** — screen rendering resolves `pluginInstanceId` through `PluginsService`, decrypting settings via `EncryptionService` and fetching live data before rendering PNG/HTML.
- **Support virtual plugin template IDs** — widgets with `templateId >= PLUGIN_TEMPLATE_OFFSET` map to a shared `plugin` base template on screen create/update, and restore their virtual IDs on read.
- **Fix API base URLs** — strips a trailing `/api` from configured `API_URL`/`api.url` values when building image URLs.
- **Kindle Voyage preset** — rewrites the frontend `TRMNL X Portrait` (1404×1872) resolution preset to Kindle Voyage (1072×1448).
- **Nginx cleanup** — an S6 `cont-init.d` script removes `/etc/nginx/sites-enabled/default` at container start.

## Build & deploy

```bash
docker build -t inker-railway .
docker run -p 3002:3002 inker-railway
```

On Railway, just point the service at this repo — the `Dockerfile` is self-contained and needs no build args.

### Build-time environment overrides

| Variable | Default | Purpose |
|---|---|---|
| `INKER_MAIN_JS` | `/app/dist/main.js` | Path to the upstream bundle being patched |
| `INKER_FRONTEND_ASSETS` | `/usr/share/nginx/html/assets` | Directory scanned for the resolution preset |
| `GOOGLE_CALENDAR_PLUGIN_JSON` | `/tmp/google-calendar-plugin.json` | Plugin manifest injected into the bundle |

The patch script is idempotent-ish: `replaceOnce` logs "already patched" if the target text is present, and hard-fails the build if an expected upstream source block is missing (i.e., upstream changed).

## Plugin configuration

### Todoist Tasks
- `api_token` (required, encrypted), `query` (default `today | overdue`), `limit` (1–24), `title`, `lang`, `timezone`, `screen_width`, `screen_height`

### Google Calendar
- `calendar_ids` (comma-separated, `primary` works), `layout` (`agenda`/`upcoming`/`week`/`month`), `days_ahead`, `max_events`, `time_format`, `include_event_time`, `include_description`, `show_location`, `include_declined`, `include_past`, `ignored_phrases`, `week_start`, `privacy_mode` (`details`/`busy_only`)

## Repository layout

| File | Role |
|---|---|
| `Dockerfile` | Base image, copies + runs the patch script, installs the nginx init hook |
| `patch-inker.js` | All build-time bundle/frontend patches and the inlined Todoist plugin |
| `google-calendar-plugin.json` | Google Calendar plugin manifest (settings schema, markup variants, OAuth config) |

## Caveats

- Patching is string-replacement on a compiled upstream bundle — pinning to `wojooo/inker:0.6.0` is intentional; bumping the base image may break `replaceOnce` lookups until patterns are updated.
- OAuth credentials and API tokens are stored encrypted via the upstream `EncryptionService`.

## A Second Heart literary clock

The bundled **A Second Heart** plugin displays a credited literary quote for the
current minute, with the time phrase highlighted. It includes 10,156 quotes covering
every minute, requires no account or API key, and makes no external data requests.

After rebuilding this image, click **Install** on **A Second Heart** in Plugins.
Open **Installed → Settings**, save its timezone
(for example `Asia/Kolkata`), and add it to a full-screen screen. Use a portrait
screen of 600 × 800 or larger. Configure the screen and Kindle to refresh every
60 seconds where supported; the plugin cannot wake a sleeping device.

`SECOND_HEART_PLUGIN_JSON` overrides the build-time manifest path (default
`/tmp/second-heart-plugin.json`). The quotes and integration come from
[A Second Heart](https://github.com/sreechand/a-second-heart), whose integration
code is GPL-3.0; book excerpts retain their original authorship.
This is an Inkling screen, not a replacement for Kindle's native lock screen.

Validated locally against the actual Inker 0.6.0 ARM64 container: plugin installation,
settings save, minute cache rollover, and instance/saved-screen rendering at
600 × 800 and 1072 × 1448. Physical Kindle refresh remains untested.
The repeatable disposable-container check is `tests/second-heart-smoke.cjs`.
