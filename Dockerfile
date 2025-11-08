# Production Dockerfile for Calvin Dashboard
FROM python:3.11-slim as backend-builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install UV
RUN pip install uv

# Set working directory
WORKDIR /app

# Copy backend files
COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/app ./app

# Install Python dependencies
RUN uv sync --frozen --no-dev

# Build frontend
FROM node:20-slim as frontend-builder

WORKDIR /app

# Copy frontend files
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Production image
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install UV
RUN pip install uv

WORKDIR /app

# Copy backend from builder
COPY --from=backend-builder /app/.venv /app/.venv
COPY --from=backend-builder /app/app /app/app
COPY --from=backend-builder /app/pyproject.toml /app/

# Copy frontend build from builder
COPY --from=frontend-builder /app/dist /app/frontend/dist

# Create data directories
RUN mkdir -p /app/data/db /app/data/images /app/data/cache/images /app/logs

# Expose port
EXPOSE 8000

# Run backend
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

