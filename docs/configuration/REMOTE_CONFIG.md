# Remote Settings Configuration

## Problem

By default the frontend calls `/api` on the same origin that served it. When
you run `npm run dev` on your laptop, that means the **local** backend, so
settings you edit are written to the laptop's database instead of the remote
dashboard's.

## Solution

Point the frontend at the remote backend, either with the Vite dev proxy or
with an absolute API URL.

### Option 1: Dev proxy (`VITE_API_PROXY_TARGET`)

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8000` by default.
Point it at the remote dashboard instead:

```bash
cd frontend
VITE_API_PROXY_TARGET=http://192.168.1.100:8000 npm run dev
```

To keep the setting, create `frontend/.env.local` (Vite loads it
automatically; there is no checked-in `frontend/.env.example`):

```env
# frontend/.env.local
VITE_API_PROXY_TARGET=http://192.168.1.100:8000
```

The browser keeps calling same-origin `/api`, so no CORS configuration is
needed.

### Option 2: Absolute API URL (`VITE_API_URL`)

Set `VITE_API_URL` when the browser should call the remote backend directly.
It must include the `/api` suffix:

```env
# frontend/.env.local
VITE_API_URL=http://192.168.1.100:8000/api
```

This applies to `npm run dev`, `npm run build`, and the packaged frontend.
Restart the dev server (or rebuild) after changing it.

### Option 3: Build with a remote API

```bash
cd frontend
VITE_API_URL=http://192.168.1.100:8000/api npm run build
```

The production Docker image serves the frontend from the backend, so the
relative default (`/api`) is the usual choice there.

## CORS

Cross-origin browser calls (`VITE_API_URL`) need the backend to allow the
frontend origin. CORS is **not** hard-coded in `main.py`; it comes from two
settings read from the environment (`backend/app/config.py`):

- **`CORS_ORIGINS`** — comma-separated list of allowed origins. Default:
  `http://localhost:5173,http://localhost:8000`.
- **`CORS_ALLOW_ALL`** — set to `true` to allow every origin (development
  only; never on a network you don't control).

Example for a dev machine at `192.168.1.50:5173`:

```bash
# backend/.env or docker/.env
CORS_ORIGINS=http://localhost:5173,http://localhost:8000,http://192.168.1.50:5173
```

Restart the backend after changing it. If you point the frontend at the
backend's own origin (or use the dev proxy), leave CORS alone.

## Finding Your Remote Dashboard's IP Address

On the remote dashboard (Raspberry Pi):

```bash
hostname -I
# or
ip addr show | grep "inet " | grep -v 127.0.0.1
```

From your development machine, check your router's client list or scan the
LAN (`nmap -sn 192.168.1.0/24`).

## Verifying the Connection

1. Start the frontend with the remote target configured.
2. Open the browser console (F12) → Network.
3. Confirm `/api/...` requests go to the remote host (via the proxy or the
   absolute URL).
4. Change a setting and confirm it appears on the remote dashboard.

## Troubleshooting

### CORS errors

- Set `CORS_ORIGINS` on the **backend** to include the exact frontend origin
  (scheme, host, and port), then restart it.
- For a quick local check only, `CORS_ALLOW_ALL=true`.
- Prefer the dev proxy (`VITE_API_PROXY_TARGET`) to avoid CORS entirely.

### Connection refused

- Check the backend: `curl http://192.168.1.100:8000/api/health`.
- Check firewall rules and that the backend binds an interface reachable from
  your machine.
- Verify the IP and port.

### Settings still not syncing

- Confirm the URL in `frontend/.env.local` and restart `npm run dev`.
- Check the browser console for API errors.
- Make sure you are editing the frontend instance pointed at the remote
  backend.

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐
│  Dev Machine    │         │ Remote Dashboard │
│  Frontend       │────────▶│ Backend API      │
│  (Browser)      │         │ (Port 8000)      │
│                 │         │ SQLite DB        │
└─────────────────┘         └──────────────────┘
```

## Switching Back to Local Development

Remove `VITE_API_URL` / `VITE_API_PROXY_TARGET` from `frontend/.env.local`
(or delete the file) and restart the dev server. The frontend then uses the
same-origin `/api` path and the local backend.
