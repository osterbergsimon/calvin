# Building and Running Docker Containers

This guide covers how to build and run Calvin Dashboard using Docker containers.

## Prerequisites

- Docker Engine 20.10+ or Docker Desktop
- Docker Compose 2.0+ (usually included with Docker Desktop)
- For multi-architecture builds: Docker Buildx (usually included with Docker)

## Quick Reference

### Development

```bash
# Start development containers with hot-reload
docker-compose -f docker/docker-compose.dev.yml up

# Or run in background
docker-compose -f docker/docker-compose.dev.yml up -d

# View logs
docker-compose -f docker/docker-compose.dev.yml logs -f

# Stop containers
docker-compose -f docker/docker-compose.dev.yml down
```

### Production (Local - Separate Containers)

```bash
# Build and start
docker-compose -f docker/docker-compose.prod-separate.yml up -d

# View logs
docker-compose -f docker/docker-compose.prod-separate.yml logs -f

# Stop
docker-compose -f docker/docker-compose.prod-separate.yml down
```

### Production (Local - Monolithic)

```bash
# Build and start
docker-compose -f docker/docker-compose.prod.yml up -d calvin-prod

# View logs
docker-compose -f docker/docker-compose.prod.yml logs -f calvin-prod

# Stop
docker-compose -f docker/docker-compose.prod.yml down
```

### Distributed Deployment

**Backend Server:**
```bash
export CORS_ORIGINS=http://192.168.1.50:80
docker-compose -f docker/docker-compose.backend-only.yml up -d
```

**Frontend (Raspberry Pi):**
```bash
export BACKEND_URL=http://192.168.1.100:8000/api
docker-compose -f docker/docker-compose.frontend-only.yml up -d
```

## Building Images

### Manual Build (Single Architecture)

#### Backend Only
```bash
cd docker
docker build -f Dockerfile.backend-prod -t calvin-backend:latest ..
```

#### Frontend Only
```bash
cd docker
docker build -f Dockerfile.frontend-prod -t calvin-frontend:latest \
  --build-arg VITE_API_URL=/api ..
```

#### Development Backend
```bash
cd docker
docker build -f Dockerfile.backend-dev -t calvin-backend-dev:latest \
  ../backend
```

#### Development Frontend
```bash
cd docker
docker build -f Dockerfile.frontend-dev -t calvin-frontend-dev:latest \
  ../frontend
```

### Multi-Architecture Builds

For building images that support multiple architectures (amd64, arm64, arm/v7):

#### Using the Build Script

```bash
cd docker

# Build for all architectures and push to registry
./build-multiarch.sh --both --push --repo your-registry/calvin --tag latest

# Build only backend
./build-multiarch.sh --backend --push --repo your-registry/calvin

# Build only frontend
./build-multiarch.sh --frontend --push --repo your-registry/calvin

# Build for specific architectures
./build-multiarch.sh --both --push --repo your-registry/calvin \
  --arch linux/amd64,linux/arm64

# Build for local use (single platform only)
./build-multiarch.sh --both --arch linux/amd64
```

**Note**: Multi-platform builds require pushing to a registry. For local builds, specify a single platform.

#### Using Docker Buildx Directly

```bash
# Create buildx builder (first time only)
docker buildx create --name calvin-multiarch --use
docker buildx inspect --bootstrap

# Build and push backend
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  --file docker/Dockerfile.backend-prod \
  --tag your-registry/calvin-backend:latest \
  --push \
  .

# Build and push frontend
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  --file docker/Dockerfile.frontend-prod \
  --build-arg VITE_API_URL=/api \
  --tag your-registry/calvin-frontend:latest \
  --push \
  .
```

### Using Pre-built Images from Registry

If images are available in a registry:

```bash
# Pull images
docker pull your-registry/calvin-backend:latest
docker pull your-registry/calvin-frontend:latest

# Tag for local use
docker tag your-registry/calvin-backend:latest calvin-backend:latest
docker tag your-registry/calvin-frontend:latest calvin-frontend:latest

# Use with docker-compose
docker-compose -f docker/docker-compose.prod-separate.yml up -d
```

## Running Containers

### Development Mode

Development mode uses hot-reload for both backend and frontend:

```bash
# Start development containers
docker-compose -f docker/docker-compose.dev.yml up

# Access:
# - Backend API: http://localhost:8000
# - Frontend Dev Server: http://localhost:5173
# - API Docs: http://localhost:8000/docs
```

**Features:**
- Code changes trigger automatic reload
- Source code mounted as volumes
- Fast iteration cycle
- Separate ports for backend (8000) and frontend (5173)

### Production Mode (Separate Containers)

Production mode uses optimized images with separate containers:

```bash
# Start production containers
docker-compose -f docker/docker-compose.prod-separate.yml up -d

# Access:
# - Backend API: http://localhost:8000
# - Frontend: http://localhost:80
# - API Docs: http://localhost:8000/docs
```

**Features:**
- Optimized multi-stage builds
- Nginx for frontend static file serving
- Separate containers for scalability
- Production-ready configuration

### Production Mode (Monolithic)

Legacy single-container deployment:

```bash
# Start monolithic container
docker-compose -f docker/docker-compose.prod.yml up -d calvin-prod

# Access:
# - Application: http://localhost:8000
# - API Docs: http://localhost:8000/docs
```

**Features:**
- Single container for simplicity
- Backend serves frontend static files
- All-in-one deployment
- Backwards compatible

### Distributed Deployment

Run backend and frontend on separate machines:

#### Step 1: Backend Server

On the machine hosting the backend (e.g., home server):

```bash
# Set CORS origins (comma-separated)
export CORS_ORIGINS=http://192.168.1.50:80,http://rpi.local:80

# Start backend
docker-compose -f docker/docker-compose.backend-only.yml up -d

# Backend available at: http://backend-ip:8000
```

#### Step 2: Frontend

On the machine hosting the frontend (e.g., Raspberry Pi):

```bash
# Set backend URL
export BACKEND_URL=http://192.168.1.100:8000/api

# Start frontend
docker-compose -f docker/docker-compose.frontend-only.yml up -d

# Frontend available at: http://localhost:80
```

**Important Notes:**
- Backend URL is embedded at build time, so you must rebuild the frontend image if the backend URL changes
- Ensure CORS is properly configured on the backend
- Verify network connectivity between machines
- Consider firewall rules

## Using VS Code Dev Containers

VS Code dev containers provide a fully configured development environment:

### Prerequisites

- VS Code with [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- Docker Desktop or Docker Engine

### Opening in Dev Container

1. Open VS Code in the project root
2. Press `F1` or `Ctrl+Shift+P` (Windows/Linux) / `Cmd+Shift+P` (Mac)
3. Select "Dev Containers: Reopen in Container"
4. VS Code will build and start the containers automatically

### Features

- Pre-configured Python and Node.js environments
- VS Code extensions automatically installed
- Port forwarding configured (8000, 5173)
- Full development environment in container
- Code mounted as volumes for hot-reload

### Customization

Edit `.devcontainer/devcontainer.json` to customize:
- VS Code extensions
- Settings
- Port forwarding
- Features

## Container Management

### Viewing Logs

```bash
# All containers
docker-compose -f docker/docker-compose.dev.yml logs -f

# Specific service
docker-compose -f docker/docker-compose.dev.yml logs -f calvin-backend-dev

# Last 100 lines
docker-compose -f docker/docker-compose.dev.yml logs --tail=100
```

### Container Status

```bash
# List running containers
docker-compose -f docker/docker-compose.dev.yml ps

# Inspect container
docker inspect calvin-backend-dev

# Container stats
docker stats calvin-backend-dev calvin-frontend-dev
```

### Executing Commands

```bash
# Open shell in backend container
docker-compose -f docker/docker-compose.dev.yml exec calvin-backend-dev /bin/bash

# Run command in container
docker-compose -f docker/docker-compose.dev.yml exec calvin-backend-dev uv run python -m pytest

# Open shell in frontend container
docker-compose -f docker/docker-compose.dev.yml exec calvin-frontend-dev /bin/bash
```

### Stopping and Cleaning Up

```bash
# Stop containers (keeps volumes)
docker-compose -f docker/docker-compose.dev.yml stop

# Stop and remove containers (keeps volumes)
docker-compose -f docker/docker-compose.dev.yml down

# Stop and remove containers and volumes
docker-compose -f docker/docker-compose.dev.yml down -v

# Remove stopped containers
docker-compose -f docker/docker-compose.dev.yml rm

# Remove images
docker-compose -f docker/docker-compose.dev.yml down --rmi all
```

### Rebuilding Images

```bash
# Rebuild all images
docker-compose -f docker/docker-compose.dev.yml build

# Rebuild specific service
docker-compose -f docker/docker-compose.dev.yml build calvin-backend-dev

# Rebuild without cache
docker-compose -f docker/docker-compose.dev.yml build --no-cache

# Rebuild and restart
docker-compose -f docker/docker-compose.dev.yml up -d --build
```

## Data Persistence

### Volumes

Calvin Dashboard uses Docker volumes for data persistence:

- `calvin-data` - Database, images, and configuration
- `calvin-logs` - Application logs
- `backend-venv` (dev) - Python virtual environment
- `frontend-node-modules` (dev) - Node.js modules

### Backup and Restore

#### Backup

```bash
# Backup data volume
docker run --rm -v calvin-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/calvin-data-backup.tar.gz -C /data .

# Backup logs
docker run --rm -v calvin-logs:/data -v $(pwd):/backup \
  alpine tar czf /backup/calvin-logs-backup.tar.gz -C /data .
```

#### Restore

```bash
# Restore data volume
docker run --rm -v calvin-data:/data -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/calvin-data-backup.tar.gz"

# Restore logs
docker run --rm -v calvin-logs:/data -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/calvin-logs-backup.tar.gz"
```

## Troubleshooting

### Port Already in Use

If ports 8000, 5173, or 80 are already in use:

```bash
# Find process using port
# Linux/Mac
lsof -i :8000

# Windows
netstat -ano | findstr :8000

# Change ports in docker-compose.yml
ports:
  - "8001:8000"  # Change host port
```

### Permission Issues

On Linux, if you encounter permission issues:

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or:
newgrp docker
```

### Container Won't Start

```bash
# Check logs
docker-compose -f docker/docker-compose.dev.yml logs

# Check container status
docker-compose -f docker/docker-compose.dev.yml ps

# Rebuild without cache
docker-compose -f docker/docker-compose.dev.yml build --no-cache
```

### Network Issues (Distributed Deployment)

```bash
# Test backend connectivity from frontend machine
curl http://backend-ip:8000/api/health

# Check firewall rules
# Linux
sudo ufw status
sudo ufw allow 8000/tcp

# Check CORS configuration
docker-compose -f docker/docker-compose.backend-only.yml exec calvin-backend \
  env | grep CORS
```

### Build Issues

```bash
# Clear Docker build cache
docker builder prune

# Clear all unused data
docker system prune -a

# Rebuild from scratch
docker-compose -f docker/docker-compose.dev.yml build --no-cache --pull
```

## Performance Tips

1. **Use volumes for node_modules and .venv** (already configured in dev mode)
2. **Multi-stage builds** reduce image size (production images)
3. **Layer caching** speeds up rebuilds
4. **Buildx** enables parallel builds for multi-architecture
5. **Resource limits** can be set in docker-compose.yml for production

## Next Steps

> **Note:** This document has been moved to the documentation. For the most up-to-date information, see:
> - [Getting Started with Docker](../docs/setup/GETTING_STARTED_DOCKER.md) - Complete getting started guide
> - [Docker Overview](../docs/setup/DOCKER_OVERVIEW.md) - Deployment scenarios and configuration
> - [Docker Building and Running](../docs/setup/DOCKER_BUILDING_AND_RUNNING.md) - This document (updated version)

- See [Getting Started](../docs/setup/GETTING_STARTED.md) for native installation options
- See [Contributing Guide](../docs/CONTRIBUTING.md) for development guidelines
