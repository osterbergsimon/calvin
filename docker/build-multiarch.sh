#!/bin/bash
# Build script for multi-architecture Docker images
# Supports: linux/amd64, linux/arm64, linux/arm/v7

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default architectures
ARCHITECTURES="linux/amd64,linux/arm64,linux/arm/v7"

# Parse command line arguments
BUILD_BACKEND=false
BUILD_FRONTEND=false
PUSH=false
REPO=""
TAG="latest"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --backend          Build backend image"
    echo "  --frontend         Build frontend image"
    echo "  --both             Build both images (default)"
    echo "  --push             Push images to registry after build"
    echo "  --repo REPO        Docker repository (required if --push)"
    echo "  --tag TAG          Image tag (default: latest)"
    echo "  --arch ARCHS       Comma-separated architectures (default: linux/amd64,linux/arm64,linux/arm/v7)"
    echo "  -h, --help         Show this help message"
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backend)
            BUILD_BACKEND=true
            shift
            ;;
        --frontend)
            BUILD_FRONTEND=true
            shift
            ;;
        --both)
            BUILD_BACKEND=true
            BUILD_FRONTEND=true
            shift
            ;;
        --push)
            PUSH=true
            shift
            ;;
        --repo)
            REPO="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        --arch)
            ARCHITECTURES="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Default to both if nothing specified
if [ "$BUILD_BACKEND" = false ] && [ "$BUILD_FRONTEND" = false ]; then
    BUILD_BACKEND=true
    BUILD_FRONTEND=true
fi

# Check for docker buildx
if ! docker buildx version > /dev/null 2>&1; then
    echo "Error: docker buildx is not available"
    echo "Please install Docker with buildx support"
    exit 1
fi

# Create buildx builder if it doesn't exist
BUILDER_NAME="calvin-multiarch"
if ! docker buildx inspect "$BUILDER_NAME" > /dev/null 2>&1; then
    echo "Creating buildx builder: $BUILDER_NAME"
    docker buildx create --name "$BUILDER_NAME" --use
    docker buildx inspect --bootstrap
else
    echo "Using existing buildx builder: $BUILDER_NAME"
    docker buildx use "$BUILDER_NAME"
fi

# Build backend
if [ "$BUILD_BACKEND" = true ]; then
    BACKEND_IMAGE="${REPO:+${REPO}/}calvin-backend:${TAG}"
    
    echo ""
    echo "Building backend image: $BACKEND_IMAGE"
    echo "Architectures: $ARCHITECTURES"
    
    # Count platforms
    PLATFORM_COUNT=$(echo "$ARCHITECTURES" | tr ',' '\n' | wc -l)
    
    if [ "$PUSH" = true ]; then
        if [ -z "$REPO" ]; then
            echo "Error: --repo is required when using --push"
            exit 1
        fi
        docker buildx build \
            --platform "$ARCHITECTURES" \
            --file "$SCRIPT_DIR/Dockerfile.backend-prod" \
            --tag "$BACKEND_IMAGE" \
            --push \
            "$PROJECT_ROOT"
    elif [ "$PLATFORM_COUNT" -gt 1 ]; then
        echo "Error: Multi-platform builds require --push to a registry"
        echo "For local builds, use docker-compose or specify a single platform with --arch"
        exit 1
    else
        # Single platform - can use --load
        docker buildx build \
            --platform "$ARCHITECTURES" \
            --file "$SCRIPT_DIR/Dockerfile.backend-prod" \
            --tag "$BACKEND_IMAGE" \
            --load \
            "$PROJECT_ROOT"
    fi
fi

# Build frontend
if [ "$BUILD_FRONTEND" = true ]; then
    FRONTEND_IMAGE="${REPO:+${REPO}/}calvin-frontend:${TAG}"
    
    echo ""
    echo "Building frontend image: $FRONTEND_IMAGE"
    echo "Architectures: $ARCHITECTURES"
    
    # Default API URL for frontend build
    VITE_API_URL="${VITE_API_URL:-/api}"
    
    # Count platforms
    PLATFORM_COUNT=$(echo "$ARCHITECTURES" | tr ',' '\n' | wc -l)
    
    if [ "$PUSH" = true ]; then
        if [ -z "$REPO" ]; then
            echo "Error: --repo is required when using --push"
            exit 1
        fi
        docker buildx build \
            --platform "$ARCHITECTURES" \
            --file "$SCRIPT_DIR/Dockerfile.frontend-prod" \
            --build-arg VITE_API_URL="$VITE_API_URL" \
            --tag "$FRONTEND_IMAGE" \
            --push \
            "$PROJECT_ROOT"
    elif [ "$PLATFORM_COUNT" -gt 1 ]; then
        echo "Error: Multi-platform builds require --push to a registry"
        echo "For local builds, use docker-compose or specify a single platform with --arch"
        exit 1
    else
        # Single platform - can use --load
        docker buildx build \
            --platform "$ARCHITECTURES" \
            --file "$SCRIPT_DIR/Dockerfile.frontend-prod" \
            --build-arg VITE_API_URL="$VITE_API_URL" \
            --tag "$FRONTEND_IMAGE" \
            --load \
            "$PROJECT_ROOT"
    fi
fi

echo ""
echo "Build completed successfully!"
