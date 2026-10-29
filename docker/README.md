# Docker

Calvin runs as a single container: FastAPI backend with the frontend
`dist/` baked in, served on the same port. CI publishes a multi-arch
image (amd64 / arm64 / arm/v7) to `ghcr.io/osterbergsimon/calvin`.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build for the runtime image. Stage 1 builds the frontend with Vite, stage 2 installs backend deps via uv, stage 3 is a slim Python image with the venv + dist baked in. |
| `docker-compose.yml` | Production compose. Pulls the published image, mounts persistent state, auto-loads `.env` co-located with the compose file. |
| `docker-compose.dev.yml` | Hot-reload dev compose. Bind-mounts the repo, runs uvicorn `--reload` and Vite dev server in separate containers. |

## Production

The Pi `setup.sh --mode prod` does this for you. To do it by hand:

```bash
sudo install -d /etc/calvin
sudo install -m 0644 docker/docker-compose.yml /etc/calvin/docker-compose.yml
sudo install -m 0640 deploy/calvin.env.example /etc/calvin/.env
sudo $EDITOR /etc/calvin/.env

sudo docker compose -f /etc/calvin/docker-compose.yml up -d
```

Both files live in `/etc/calvin/`. Compose auto-loads `.env` from the
same directory as the compose file — no `--env-file` flag, no
`env_file:` directive in the YAML. The values are both substituted
into the compose YAML and exported to the container.

Calvin keeps its database, images, and installed plugins under
`${CALVIN_DATA_DIR}` (defaults to `/var/lib/calvin`).

Updating:

```bash
sudo /usr/local/bin/update-calvin.sh
```

`update-calvin.sh` runs `docker compose pull && docker compose up -d`
and waits for `/api/health`.

## Development

```bash
cp deploy/calvin.env.example docker/.env       # one-time
docker compose -f docker/docker-compose.dev.yml up
```

- Backend on `http://localhost:8000` (uvicorn `--reload`)
- Frontend on `http://localhost:5173` (Vite dev server, proxies `/api`
  to the backend)

State lives in `./.calvin-dev-data/` by default — override with
`CALVIN_DATA_DIR` in your environment.

If you'd rather run the toolchain natively, see `docs/setup/QUICKSTART_DEVELOP.md`.

## CI / Publishing

`.github/workflows/docker-build.yml` builds and pushes the runtime image
to `ghcr.io/osterbergsimon/calvin`. `develop` is the deploy branch;
`main` is release-only and not part of the deploy path.

| Trigger | Tags pushed | Platforms |
|---|---|---|
| Push to `develop` (docs-only pushes skipped) | `develop`, `sha-<commit>` | amd64, arm64, arm/v7 |
| Push of a `v*` tag | `X.Y.Z`, `X.Y`, `latest`, `sha-<commit>` | amd64, arm64, arm/v7 |
| Pull request | nothing (build-only smoke test) | amd64 |
| Manual run with *Push image* ticked | `sha-<commit>` (+ `develop` when run on develop) | amd64, arm64, arm/v7 |

Servers (Unraid, the Pi compose default) run `:develop`. A merge to
`develop` publishes a new `:develop` about 20 minutes later; servers pick
it up on their next pull (`docker compose pull && docker compose up -d`,
or *Check for Updates* on Unraid). Pin a `sha-<commit>` tag to freeze a
deploy.

There is no scheduled build: GitHub runs `schedule` triggers only from
the default branch (`main`), so a nightly defined on `develop` never
fires.

The package must be **public** so Unraid and Pis can pull it without a
login. It already is; if it is ever recreated, set it again under
GitHub → Packages → `calvin` → Package settings → Change visibility.

## Container runtime

`entrypoint.sh` runs as root, then drops to `PUID:PGID` (default `0:0`,
root; Unraid uses `99:100`). On every start it:

- creates the data layout under `/var/lib/calvin` and refreshes the
  built-in themes file;
- re-installs the pip packages that installed plugins declare
  (`dependencies.packages`), because the venv lives in the image and is
  replaced when the container is recreated;
- chowns the data volume and the venv to `PUID:PGID` where they differ,
  so live plugin installs work as the unprivileged user.

`/app/data` is a symlink to `/var/lib/calvin`, so everything the backend
writes under a relative `./data/...` path (installed themes, caches) is
persisted on the volume. The kiosk signing key is put there explicitly
(`KIOSK_SIGNING_KEY_PATH=/var/lib/calvin/kiosk-signing.key`).
