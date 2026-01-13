# CI/CD for Docker Images

Calvin Dashboard uses GitHub Actions to automatically build and push Docker images to GitHub Container Registry (GHCR).

## Overview

The CI/CD pipeline automatically:
- Builds multi-architecture Docker images (amd64, arm64, arm/v7)
- Pushes images to `ghcr.io/osterbergsimon/calvin-backend` and `ghcr.io/osterbergsimon/calvin-frontend`
- Tags images appropriately based on branch or tag
- Uses build caching for faster builds

## Workflow Triggers

The workflow runs on:
- **Push to `main` branch**: Builds and pushes images tagged with `main` and `latest`
- **Push to `develop` branch**: Builds and pushes images tagged with `develop`
- **Git tags** (e.g., `v1.0.0`): Builds and pushes versioned images
- **Pull requests**: Builds images but doesn't push (for testing)
- **Manual trigger**: Can be manually triggered from GitHub Actions UI

## Image Tags

Images are automatically tagged with:
- **Branch name**: `main`, `develop` (for branch pushes)
- **Version tags**: `v1.0.0`, `1.0.0`, `1.0` (for git tags)
- **Latest**: `latest` (only for `main` branch)

### Example Tags

For a push to `main`:
- `ghcr.io/osterbergsimon/calvin-backend:main`
- `ghcr.io/osterbergsimon/calvin-backend:latest`

For a git tag `v1.2.3`:
- `ghcr.io/osterbergsimon/calvin-backend:v1.2.3`
- `ghcr.io/osterbergsimon/calvin-backend:1.2.3`
- `ghcr.io/osterbergsimon/calvin-backend:1.2`

## Using Pre-built Images

### Pulling Images

```bash
# Pull latest images
docker pull ghcr.io/osterbergsimon/calvin-backend:latest
docker pull ghcr.io/osterbergsimon/calvin-frontend:latest

# Pull specific version
docker pull ghcr.io/osterbergsimon/calvin-backend:v1.0.0
docker pull ghcr.io/osterbergsimon/calvin-frontend:v1.0.0

# Pull from develop branch
docker pull ghcr.io/osterbergsimon/calvin-backend:develop
docker pull ghcr.io/osterbergsimon/calvin-frontend:develop
```

### Authentication

To pull images from GHCR, you may need to authenticate:

```bash
# Using GitHub Personal Access Token
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Or using GitHub CLI
gh auth token | docker login ghcr.io -u USERNAME --password-stdin
```

### Using in Docker Compose

Update your `docker-compose.yml` to use pre-built images:

```yaml
services:
  calvin-backend:
    image: ghcr.io/osterbergsimon/calvin-backend:latest
    # ... rest of config

  calvin-frontend:
    image: ghcr.io/osterbergsimon/calvin-frontend:latest
    # ... rest of config
```

## Local Development

For local development, you can still build images manually:

```bash
# Build locally
cd docker
docker build -f Dockerfile.backend-prod -t calvin-backend:local ..
docker build -f Dockerfile.frontend-prod -t calvin-frontend:local ..
```

Or use docker-compose:

```bash
docker-compose -f docker/docker-compose.dev.yml build
```

## Multi-Architecture Support

All images are built for:
- `linux/amd64` - Intel/AMD 64-bit
- `linux/arm64` - ARM 64-bit (Apple Silicon, modern Raspberry Pi)
- `linux/arm/v7` - ARM 32-bit (Raspberry Pi 3B+ and older)

Docker will automatically select the correct architecture for your platform.

## Build Caching

The CI/CD pipeline uses GitHub Actions cache to speed up builds:
- Build layers are cached between runs
- Only changed layers are rebuilt
- Significantly reduces build time

## Manual Workflow Trigger

You can manually trigger the workflow from GitHub:

1. Go to **Actions** tab in GitHub
2. Select **Build and Push Docker Images**
3. Click **Run workflow**
4. Optionally enable **Push images to registry**
5. Click **Run workflow**

## Monitoring Builds

- View build status in the **Actions** tab
- Check build logs for any issues
- Images are automatically published to GHCR on successful builds

## Troubleshooting

### Build Failures

If builds fail:
1. Check the Actions logs for error messages
2. Verify Dockerfile syntax
3. Check for dependency issues
4. Ensure all required files are present

### Authentication Issues

If you can't pull images:
1. Ensure you're authenticated with GHCR
2. Check that the repository is public or you have access
3. Verify your GitHub token has `read:packages` permission

### Architecture-Specific Issues

If an image doesn't work on your platform:
1. Verify the architecture is supported (amd64, arm64, arm/v7)
2. Check that Docker is correctly detecting your platform
3. Try pulling a specific architecture: `docker pull --platform linux/amd64 ghcr.io/...`

## Related Documentation

- [Getting Started with Docker](GETTING_STARTED_DOCKER.md)
- [Docker Building and Running](DOCKER_BUILDING_AND_RUNNING.md)
- [Docker Overview](DOCKER_OVERVIEW.md)
