# Docker Setup for Calvin Dashboard

This directory contains Docker configurations for different deployment scenarios.

## Quick Start

### Production Image
```bash
# Build and run production image
docker-compose up -d calvin-prod

# Access at http://localhost:8000
```

### Development Image (Auto-pull from GitHub)
```bash
# Build and run dev image with auto-update
docker-compose up -d calvin-dev

# Auto-updates every 5 minutes (configurable via AUTO_UPDATE_INTERVAL)
# Access at http://localhost:8000
```

### Development with Hot-Reload (Local Code)
```bash
# Run with local code, hot-reload enabled
docker-compose -f docker-compose.dev.yml up

# Backend: http://localhost:8000 (auto-reloads on code changes)
# Frontend: http://localhost:5173 (Vite dev server with HMR)
```

## Image Types

### 1. Production Image (`Dockerfile`)
- **Purpose**: Production deployment
- **Features**: 
  - Multi-stage build (optimized size)
  - Code baked into image
  - No auto-update
- **Use case**: Final deployment, stable releases

### 2. Development Image (`Dockerfile.dev`)
- **Purpose**: Development/testing on Raspberry Pi
- **Features**:
  - Auto-pulls latest code from GitHub
  - Auto-updates dependencies
  - Auto-rebuilds frontend
  - Auto-restarts services
  - Configurable update interval
- **Use case**: Testing on RPi without reflashing

### 3. Development with Hot-Reload (`docker-compose.dev.yml`)
- **Purpose**: Active development
- **Features**:
  - Mounts local code as volumes
  - Hot-reload on code changes
  - Separate backend/frontend containers
  - Fast iteration
- **Use case**: Local development, rapid testing

## Auto-Update Configuration

The dev image supports auto-updating from GitHub:

```bash
# Set environment variables
export GIT_REPO=https://github.com/osterbergsimon/calvin.git
export GIT_BRANCH=main
export AUTO_UPDATE_INTERVAL=300  # 5 minutes

# Or in docker-compose.yml
environment:
  - GIT_REPO=https://github.com/osterbergsimon/calvin.git
  - GIT_BRANCH=main
  - AUTO_UPDATE_INTERVAL=300
```

## Manual Update

You can also manually trigger an update:

```bash
# Inside the container
docker exec -it calvin-dev /usr/local/bin/update-calvin.sh

# Or from host
docker exec calvin-dev /usr/local/bin/update-calvin.sh
```

## Better Approach: Development Workflow

For the best development experience, we recommend:

1. **Local Development**: Use `docker-compose.dev.yml` for active coding
   - Hot-reload enabled
   - Fast iteration
   - No network dependency

2. **RPi Testing**: Use `docker-compose.yml` with `calvin-dev` service
   - Auto-pulls from GitHub
   - Test latest code on actual hardware
   - No reflashing needed

3. **Production**: Use `docker-compose.yml` with `calvin-prod` service
   - Stable, optimized image
   - No auto-update
   - Production-ready

## Raspberry Pi Deployment

### Option 1: Docker on RPi (Recommended)
```bash
# On Raspberry Pi
git clone https://github.com/osterbergsimon/calvin.git
cd calvin

# For development (auto-update)
docker-compose up -d calvin-dev

# For production
docker-compose up -d calvin-prod
```

### Option 2: Native Installation (Current Approach)
- Use systemd services
- Manual updates via git pull
- See `docs/SETUP_LINUX.md`

## Advantages of Docker Approach

1. **Isolation**: Clean environment, no conflicts
2. **Portability**: Same image works everywhere
3. **Easy Updates**: Just pull new image or use auto-update
4. **Rollback**: Easy to revert to previous image
5. **Development**: Hot-reload without affecting system

## Disadvantages

1. **Overhead**: Slight performance overhead
2. **Complexity**: Additional layer of abstraction
3. **Storage**: Images take up space

For Raspberry Pi 3B+, Docker overhead is minimal and the benefits outweigh the costs.

