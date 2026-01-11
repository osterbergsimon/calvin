# Docker Overview

This document provides an overview of Docker deployment options for Calvin Dashboard.

> **Note:** For detailed getting started instructions, see [Getting Started with Docker](GETTING_STARTED_DOCKER.md).  
> For detailed build and run instructions, see [Docker Building and Running](DOCKER_BUILDING_AND_RUNNING.md).

## Overview

Calvin Dashboard can be deployed in several ways:
1. **Monolithic** - Backend and frontend in a single container (legacy)
2. **Separate Containers** - Backend and frontend in separate containers on the same machine
3. **Distributed** - Backend on one machine (e.g., home server) and frontend on another (e.g., Raspberry Pi)

All Dockerfiles support **multi-architecture** builds (amd64, arm64, arm/v7) for deployment on various platforms including Raspberry Pi.

## Quick Start

### Local Deployment (Separate Containers)

Deploy both backend and frontend on the same machine:

```bash
# From project root
docker-compose -f docker/docker-compose.prod-separate.yml up -d

# Backend: http://localhost:8000
# Frontend: http://localhost:80
```

### Distributed Deployment

#### Step 1: Backend Server (e.g., Home Server)

On the machine hosting the backend:

```bash
# Set CORS origins to allow your frontend machine(s)
export CORS_ORIGINS=http://192.168.1.50:80,http://rpi.local:80

# Start backend only
docker-compose -f docker/docker-compose.backend-only.yml up -d

# Backend will be available at http://backend-server:8000
```

#### Step 2: Frontend (e.g., Raspberry Pi)

On the machine hosting the frontend:

```bash
# Set the backend URL
export BACKEND_URL=http://192.168.1.100:8000/api

# Start frontend only
docker-compose -f docker/docker-compose.frontend-only.yml up -d

# Frontend will be available at http://localhost:80
```

### Legacy Monolithic Deployment

For backwards compatibility, the monolithic container is still available:

```bash
# From project root
docker-compose -f docker/docker-compose.prod.yml up -d calvin-prod

# Access at http://localhost:8000
```

### Development with Hot-Reload

```bash
# From project root
docker-compose -f docker/docker-compose.dev.yml up

# Backend: http://localhost:8000 (auto-reloads on code changes)
# Frontend: http://localhost:5173 (Vite dev server with HMR)
```

### VS Code Dev Containers

For a fully configured development environment in VS Code:

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Open the project in VS Code
3. Press `F1` and select "Dev Containers: Reopen in Container"
4. VS Code will build and start the containers automatically

**Note:** If you don't have a `.devcontainer` directory yet, you can create one based on the Docker development setup. See the [Getting Started with Docker](GETTING_STARTED_DOCKER.md) guide for details.

## Image Types

### Production Images

#### 1. Backend (`Dockerfile.backend-prod`)
- **Purpose**: Production backend API server
- **Features**: 
  - Multi-stage build (optimized size)
  - Python 3.11 with UV
  - FastAPI/uvicorn
- **Port**: 8000
- **Use case**: Backend API server

#### 2. Frontend (`Dockerfile.frontend-prod`)
- **Purpose**: Production frontend web server
- **Features**:
  - Multi-stage build (optimized size)
  - Nginx for static file serving
  - Built Vue.js application
- **Port**: 80
- **Use case**: Frontend web interface

#### 3. Monolithic (`Dockerfile.prod`)
- **Purpose**: Legacy single-container deployment
- **Features**: 
  - Both backend and frontend in one container
  - Backend serves frontend static files
- **Port**: 8000
- **Use case**: Simple single-machine deployment

### Development Images

#### 1. Development with Hot-Reload (`docker-compose.dev.yml`)
- **Purpose**: Active development
- **Features**:
  - Mounts local code as volumes
  - Hot-reload on code changes
  - Separate backend/frontend containers
- **Use case**: Local development, rapid testing

#### 2. Development Image (`Dockerfile.dev-prod`)
- **Purpose**: Development/testing on Raspberry Pi
- **Features**:
  - Auto-pulls latest code from GitHub
  - Auto-updates dependencies
  - Auto-rebuilds frontend
  - Auto-restarts services
- **Use case**: Testing on RPi without reflashing

## Multi-Architecture Builds

To build images for multiple architectures (amd64, arm64, arm/v7):

**Note**: Multi-architecture builds require pushing to a registry. The `--load` option only works with single-platform builds.

```bash
# Build and push to registry (for multi-architecture)
cd docker
./build-multiarch.sh --both --push --repo your-registry/calvin --tag latest

# Build only backend for specific architectures
./build-multiarch.sh --backend --push --repo your-registry/calvin --arch linux/arm64,linux/arm/v7

# Build with custom API URL for frontend
VITE_API_URL=http://backend:8000/api ./build-multiarch.sh --frontend --push --repo your-registry/calvin

# Build for local use (single platform, current architecture)
./build-multiarch.sh --both  # Builds for current platform only
```

### Prerequisites for Multi-Architecture Builds

1. Docker with buildx support
2. QEMU for cross-platform emulation (usually installed automatically)

The script will create a buildx builder if it doesn't exist.

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

**Note**: The API URL is embedded at build time. To change it, rebuild the image.

## Deployment Scenarios

### Scenario 1: Local Development

Both backend and frontend on your development machine:

```bash
docker-compose -f docker/docker-compose.dev.yml up
```

### Scenario 2: Single Machine Production

Backend and frontend on the same machine:

```bash
docker-compose -f docker/docker-compose.prod-separate.yml up -d
```

### Scenario 3: Distributed Production

Backend on home server, frontend on Raspberry Pi:

**On Home Server:**
```bash
# Configure CORS for frontend machine
export CORS_ORIGINS=http://192.168.1.50:80

docker-compose -f docker/docker-compose.backend-only.yml up -d
```

**On Raspberry Pi:**
```bash
# Configure backend URL
export BACKEND_URL=http://192.168.1.100:8000/api

docker-compose -f docker/docker-compose.frontend-only.yml up -d
```

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

## Volumes

The following volumes are used:

- `calvin-data` - Persistent data storage (database, images, etc.)
- `calvin-logs` - Application logs

Data persists across container restarts and updates.

## Networks

All containers use the `calvin-network` bridge network for local communication.

For distributed deployment, containers communicate over the host network (default Docker networking).

## Health Checks

Both backend and frontend containers include health checks:

- **Backend**: Checks `/api/health` endpoint
- **Frontend**: Checks `/health` endpoint (nginx)

Health check status can be viewed with:

```bash
docker ps
# Check STATUS column for (healthy) or (unhealthy)
```

## Troubleshooting

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

## Related Documentation

- [Getting Started with Docker](GETTING_STARTED_DOCKER.md) - Complete getting started guide
- [Docker Building and Running](DOCKER_BUILDING_AND_RUNNING.md) - Detailed build and run instructions
- [Getting Started](GETTING_STARTED.md) - Native installation options
