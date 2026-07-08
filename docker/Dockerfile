# Calvin runtime image — one image for backend + baked-in frontend dist.
#
# Stages:
#   1. frontend-builder  — Vite-builds frontend/dist
#   2. backend-builder   — uv installs backend deps into /app/.venv
#   3. runtime           — slim Python with the venv + dist baked in
#
# The result is a single image that the FastAPI app serves under one
# port: API at /api/*, SPA at everything else. No separate frontend
# container, no nginx, no plugin install rebuild path.

# ---------- 1. Frontend ----------
FROM node:22-alpine AS frontend-builder

WORKDIR /build

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build


# ---------- 2. Backend ----------
FROM python:3.12-slim AS backend-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    gcc \
    g++ \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    libfreetype6-dev \
    liblcms2-dev \
    libtiff-dev \
    libwebp-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /build
COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./

RUN uv sync --frozen --no-dev


# ---------- 3. Runtime ----------
FROM python:3.12-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend (venv + source + alembic)
COPY --from=backend-builder /build/.venv /app/.venv
COPY --from=backend-builder /build/app /app/app
COPY --from=backend-builder /build/alembic /app/alembic
COPY --from=backend-builder /build/alembic.ini /app/alembic.ini

# Frontend dist — FastAPI serves /assets/* and falls back to index.html
# for SPA routing. Backend's main.py probes ../frontend/dist relative
# to /app/, so put the dist there.
COPY --from=frontend-builder /build/dist /frontend/dist

# Runtime data directory (overridable via CALVIN_DATA_DIR / volume mount)
RUN mkdir -p /var/lib/calvin/db /var/lib/calvin/images /var/lib/calvin/plugins /app/logs

ENV CALVIN_DATA_DIR=/var/lib/calvin \
    DATABASE_URL=sqlite:////var/lib/calvin/db/calvin.db \
    IMAGE_DIR=/var/lib/calvin/images \
    PLUGIN_DIR=/var/lib/calvin/plugins \
    CALVIN_PORT=8000 \
    VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
