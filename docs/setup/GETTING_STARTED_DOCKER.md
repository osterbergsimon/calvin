# Getting Started with Docker

This guide covers getting started with Calvin using Docker. Docker provides a consistent, isolated environment for both development and production deployments.

## Prerequisites

- **Docker Engine 20.10+** or **Docker Desktop**
- **Docker Compose 2.0+** (usually included with Docker Desktop)
- For multi-architecture builds: **Docker Buildx** (usually included with Docker)

## Quick Start

### Development Mode (Recommended for Development)

Development mode provides hot-reload for both backend and frontend:

```bash
# From project root
docker-compose -f docker/docker-compose.dev.yml up
```

**Access Points:**
- Backend API: http://localhost:8000
- Frontend Dev Server: http://localhost:5173
- API Documentation: http://localhost:8000/docs

**Features:**
- ✅ Hot-reload for backend (auto-restarts on code changes)
- ✅ Hot-reload for frontend (Vite HMR - instant updates)
- ✅ Source code mounted as volumes
- ✅ Fast iteration cycle
- ✅ Separate containers for backend and frontend

**Stop containers:**
```bash
docker-compose -f docker/docker-compose.dev.yml down
```

### Production Mode (Local - Separate Containers)

Production mode uses optimized images with separate containers:

```bash
# From project root
docker-compose -f docker/docker-compose.prod-separate.yml up -d
```

**Access Points:**
- Backend API: http://localhost:8000
- Frontend: http://localhost:80
- API Documentation: http://localhost:8000/docs

**Features:**
- ✅ Optimized multi-stage builds
- ✅ Nginx for frontend static file serving
- ✅ Separate containers for scalability
- ✅ Production-ready configuration
- ✅ Runs in background (`-d` flag)

**Stop containers:**
```bash
docker-compose -f docker/docker-compose.prod-separate.yml down
```

### Production Mode (Monolithic - Legacy)

Legacy single-container deployment:

```bash
# From project root
docker-compose -f docker/docker-compose.prod.yml up -d calvin-prod
```

**Access Points:**
- Application: http://localhost:8000
- API Documentation: http://localhost:8000/docs

**Features:**
- ✅ Single container for simplicity
- ✅ Backend serves frontend static files
- ✅ All-in-one deployment
- ✅ Backwards compatible

## Deployment Scenarios

### Scenario 1: Local Development

Both backend and frontend on your development machine:

```bash
docker-compose -f docker/docker-compose.dev.yml up
```

**Use case:** Active development with hot-reload

### Scenario 2: Single Machine Production

Backend and frontend on the same machine:

```bash
docker-compose -f docker/docker-compose.prod-separate.yml up -d
```

**Use case:** Production deployment on a single server

### Scenario 3: Distributed Production

Backend on home server, frontend on Raspberry Pi:

#### Step 1: Backend Server

On the machine hosting the backend (e.g., home server):

```bash
# Set CORS origins (comma-separated list of frontend URLs)
export CORS_ORIGINS=http://192.168.1.50:80,http://rpi.local:80

# Start backend
docker-compose -f docker/docker-compose.backend-only.yml up -d
```

Backend will be available at `http://backend-server-ip:8000`.

**Important:** You must configure CORS to allow your frontend machine(s). The `CORS_ORIGINS` environment variable should include all frontend URLs.

#### Step 2: Frontend (Raspberry Pi)

On the machine hosting the frontend (e.g., Raspberry Pi):

```bash
# Set the backend URL (embedded at build time)
export BACKEND_URL=http://192.168.1.100:8000/api

# Start frontend
docker-compose -f docker/docker-compose.frontend-only.yml up -d
```

Frontend will be available at `http://localhost:80`.

**Important Notes:**
- Backend URL is embedded at build time - rebuild frontend image if backend URL changes
- Ensure CORS is properly configured on the backend
- Verify network connectivity between machines
- Consider firewall rules

### Scenario 4: Multiple Frontends

Run one backend server and multiple frontend instances:

**Backend Server:**
```bash
export CORS_ORIGINS=http://rpi1.local:80,http://rpi2.local:80,http://rpi3.local:80
docker-compose -f docker/docker-compose.backend-only.yml up -d
```

**Each Frontend (different machines):**
```bash
export BACKEND_URL=http://backend-server:8000/api
docker-compose -f docker/docker-compose.frontend-only.yml up -d
```

## Configuration

### Backend Configuration

#### Environment Variables

- `DATABASE_URL` - Database connection string (default: `sqlite:///app/data/db/calvin.db`)
- `IMAGE_DIR` - Image storage directory (default: `/app/data/images`)
- `CORS_ORIGINS` - Comma-separated list of allowed CORS origins (required for distributed deployment)
- `CORS_ALLOW_ALL` - Allow all origins (development only, default: `false`)

#### Distributed Deployment

When running backend separately, **you must configure CORS**:

```bash
# Example: Allow frontend on Raspberry Pi
export CORS_ORIGINS=http://192.168.1.50:80,http://rpi.local:80

docker-compose -f docker/docker-compose.backend-only.yml up -d
```

Or edit the docker-compose file:

```yaml
environment:
  - CORS_ORIGINS=http://192.168.1.50:80,http://rpi.local:80
```

### Frontend Configuration

#### Build Arguments

- `VITE_API_URL` - Backend API URL (set at build time)
  - For local deployment: `/api` (relative URL)
  - For distributed deployment: `http://backend-host:8000/api` (absolute URL)

#### Distributed Deployment

When running frontend separately, **you must set the backend URL**:

```bash
# Example: Backend at 192.168.1.100:8000
export BACKEND_URL=http://192.168.1.100:8000/api

docker-compose -f docker/docker-compose.frontend-only.yml up -d
```

Or edit the docker-compose file:

```yaml
build:
  args:
    - VITE_API_URL=http://192.168.1.100:8000/api
```

**Note:** The API URL is embedded at build time. To change it, rebuild the image.

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
  ..
```

#### Development Frontend
```bash
cd docker
docker build -f Dockerfile.frontend-dev -t calvin-frontend-dev:latest \
  ..
```

### Multi-Architecture Builds

Calvin Docker images support multiple architectures (amd64, arm64, arm/v7) for deployment on various platforms including Raspberry Pi.

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

# Build for local use (single platform, current architecture)
./build-multiarch.sh --both
```

**Note:** Multi-platform builds require pushing to a registry. For local builds, specify a single platform.

#### Prerequisites for Multi-Architecture Builds

1. Docker with buildx support
2. QEMU for cross-platform emulation (usually installed automatically)

The script will create a buildx builder if it doesn't exist.

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

Data persists across container restarts and updates.

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

## VS Code Dev Containers

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

**Note:** If you don't have a `.devcontainer` directory yet, you can create one based on the Docker development setup.

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

### Permission Issues (Linux)

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

### CORS Errors in Distributed Deployment

If you see CORS errors when frontend tries to connect to backend:

1. Verify `CORS_ORIGINS` includes the frontend URL
2. Check that the frontend URL matches exactly (including protocol and port)
3. Ensure backend is accessible from frontend machine (firewall, network)

### Frontend Cannot Connect to Backend

1. Verify `BACKEND_URL` is correct and accessible
2. Test backend connectivity: `curl http://backend-host:8000/api/health`
3. Check firewall rules on backend machine
4. Verify network connectivity between machines

### Multi-Architecture Build Issues

If buildx fails:

1. Ensure Docker has buildx support: `docker buildx version`
2. Create builder manually: `docker buildx create --name calvin-multiarch --use`
3. Bootstrap builder: `docker buildx inspect --bootstrap`

### Build Issues

```bash
# Clear Docker build cache
docker builder prune

# Clear all unused data
docker system prune -a

# Rebuild from scratch
docker-compose -f docker/docker-compose.dev.yml build --no-cache --pull
```

## Advantages of Docker Approach

1. **Isolation**: Clean environment, no conflicts
2. **Portability**: Same image works everywhere
3. **Multi-Architecture**: Support for amd64, arm64, arm/v7
4. **Flexibility**: Separate or combined deployments
5. **Easy Updates**: Just pull new image
6. **Rollback**: Easy to revert to previous image
7. **Development**: Hot-reload without affecting system
8. **Dev Containers**: Fully configured VS Code development environment

## Disadvantages

1. **Overhead**: Slight performance overhead
2. **Complexity**: Additional layer of abstraction
3. **Storage**: Images take up space

For Raspberry Pi 3B+, Docker overhead is minimal and the benefits outweigh the costs.

## Next Steps

- See [Getting Started](GETTING_STARTED.md) for native installation options
- See [Docker Overview](DOCKER_OVERVIEW.md) for deployment scenarios and configuration
- See [Docker Building and Running](DOCKER_BUILDING_AND_RUNNING.md) for detailed build and run instructions
- See [Contributing Guide](../CONTRIBUTING.md) for development guidelines
