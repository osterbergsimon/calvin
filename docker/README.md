# Docker

Calvin runs as a single container: FastAPI backend with the frontend
`dist/` baked in, served on the same port. CI publishes a multi-arch
image (amd64 / arm64 / arm/v7) to `ghcr.io/osterbergsimon/calvin`.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build for the runtime image. Stage 1 builds the frontend with Vite, stage 2 installs backend deps via uv, stage 3 is a slim Python image with the venv + dist baked in. |
| `docker-compose.yml` | Production compose. Pulls the published image, mounts persistent state, reads `../deploy/calvin.env`. |
| `docker-compose.dev.yml` | Hot-reload dev compose. Bind-mounts the repo, runs uvicorn `--reload` and Vite dev server in separate containers. |

## Production

```bash
cp deploy/calvin.env.example deploy/calvin.env
# edit deploy/calvin.env
docker compose -f docker/docker-compose.yml up -d
```

The compose file reads `deploy/calvin.env`. Calvin keeps its database,
images, and installed plugins under `${CALVIN_DATA_DIR}` (defaults to
`/var/lib/calvin`).

Updating:

```bash
sudo /opt/calvin/scripts/update-calvin.sh
```

`update-calvin.sh` runs `docker compose pull && docker compose up -d`
and waits for `/api/health`.

## Development

```bash
docker compose -f docker/docker-compose.dev.yml up
```

- Backend on `http://localhost:8000` (uvicorn `--reload`)
- Frontend on `http://localhost:5173` (Vite dev server, proxies `/api`
  to the backend)

State lives in `./.calvin-dev-data/` by default — override with
`CALVIN_DATA_DIR` in your environment.

If you'd rather run the toolchain natively, see `docs/setup/QUICKSTART_DEVELOP.md`.

## CI / Publishing

`.github/workflows/docker-build.yml` builds and pushes the runtime image:

- On push to `main`: tagged `latest`
- On semver tag: tagged `vX.Y.Z`, `vX.Y`
- Nightly from `develop`: tagged `develop`, `nightly`
- On PR: build only (amd64), no push, used as a smoke test

Multi-arch (`linux/amd64`, `linux/arm64`, `linux/arm/v7`) on every push
that publishes; PR builds stay amd64-only to keep validation fast.
