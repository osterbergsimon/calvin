# Calvin - Lightweight DAKBoard Alternative

## Project Overview

A lightweight home dashboard system designed to run on Raspberry Pi, displaying calendars, photos, and external web services with keyboard navigation support.

**Hardware Baseline:**
- **Device**: Raspberry Pi 3B+ (primary target, baseline)
- **Display**: Standard HDMI display (1080p)
- **Keyboard**: 7-button compact keyboard (primary) with full keyboard support (secondary)

## Technology Stack

### Backend (Python)
- **Python 3.11+**: Modern Python with latest features
- **UV**: Fast Python package installer and project manager (replaces pip)
- **FastAPI**: Modern, fast web framework for building APIs
- **APScheduler**: For scheduled tasks (image rotation, calendar refresh)
- **Google Calendar API**: Python client library
- **Proton Calendar API**: Custom integration (may need reverse engineering or API docs)
- **Pillow (PIL)**: Image processing and optimization
- **python-evdev**: Keyboard input handling on Linux/Raspberry Pi
- **SQLite**: Lightweight database for configuration and state
- **python-dotenv**: Environment variable management

### Frontend (Vue 3)
- **Vue 3** with Composition API
- **Vite**: Build tool and dev server
- **Pinia**: State management
- **Vue Router**: For navigation (if needed)
- **Axios**: HTTP client for API calls
- **WebSocket client**: For real-time updates (optional)
- **CSS Grid/Flexbox**: Responsive layouts for landscape/portrait

### Infrastructure
- **Raspberry Pi OS Lite**: Base OS (headless, minimal)
- **Chromium in kiosk mode**: Full-screen browser for dashboard display
- **systemd**: Service management for auto-start
- **cloud-init**: First-boot configuration and WiFi setup
- **Raspberry Pi Imager**: For creating custom images with pre-configuration

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Frontend (Vue 3)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Calendar │  │  Photos  │  │  Web     │      │
│  │  View    │  │ Slideshow│  │ Services │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │      Layout Manager (Landscape/Portrait) │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │      Keyboard Event Handler              │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                    ↕ HTTP/WebSocket
┌─────────────────────────────────────────────────┐
│              Backend (FastAPI)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Calendar │  │  Image   │  │ Keyboard │      │
│  │  Service │  │  Service │  │  Handler │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │      Configuration Manager                │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                    ↕
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Google  │  │  Proton  │  │  Local   │
│ Calendar │  │ Calendar │  │  Images  │
└──────────┘  └──────────┘  └──────────┘
```

## Core Components

### Backend Services

#### 1. Calendar Service
- **Responsibilities:**
  - Fetch events from Google Calendar API
  - Fetch events from Proton Calendar (API integration)
  - Cache calendar data
  - Format events for frontend consumption
  - Handle timezone conversions
  - Support multiple calendar sources

- **Endpoints:**
  - `GET /api/calendar/events?start_date=&end_date=`
  - `GET /api/calendar/sources`
  - `POST /api/calendar/sources` (add calendar)
  - `DELETE /api/calendar/sources/{id}`

#### 2. Image Service
- **Responsibilities:**
  - Scan local directory for images
  - Serve images with proper caching headers
  - Optimize images for display (resize, format conversion)
  - Track current image index
  - Support image metadata (EXIF rotation)

- **Endpoints:**
  - `GET /api/images/list`
  - `GET /api/images/{id}`
  - `GET /api/images/current`
  - `POST /api/images/next`
  - `GET /api/images/config` (rotation interval, directory path)

#### 3. Keyboard Handler Service
- **Responsibilities:**
  - Listen to keyboard input (using evdev on Linux)
  - Map key presses to actions
  - Store key mappings in configuration
  - Emit events to frontend via WebSocket or HTTP

- **Endpoints:**
  - `GET /api/keyboard/mappings`
  - `POST /api/keyboard/mappings` (update mappings)
  - `GET /api/keyboard/actions` (list available actions)
  - WebSocket: `/ws/keyboard` (real-time key events)

#### 4. Web Service Viewer
- **Responsibilities:**
  - Store URLs for external services
  - Provide iframe-friendly endpoints
  - Handle authentication tokens (if needed)

- **Endpoints:**
  - `GET /api/web-services`
  - `POST /api/web-services` (add service)
  - `GET /api/web-services/{id}/view`

#### 5. Configuration Service
- **Responsibilities:**
  - Manage application settings
  - Store layout preferences
  - Handle orientation settings
  - Persist user preferences

- **Endpoints:**
  - `GET /api/config`
  - `POST /api/config`
  - `GET /api/config/orientation`

### Frontend Components

#### 1. Calendar View Component
- **Features:**
  - Display monthly/weekly/daily views
  - Highlight today's events
  - Expandable event details
  - Multiple calendar source support
  - Color coding by calendar source

#### 2. Photo Slideshow Component
- **Features:**
  - Full-screen image display
  - Automatic rotation on interval
  - Smooth transitions
  - Support for various image formats
  - EXIF orientation handling

#### 3. Web Service Viewer Component
- **Features:**
  - Full-screen iframe display
  - Keyboard shortcuts to switch services
  - Service selection menu

#### 4. Layout Manager
- **Features:**
  - Landscape layout (wide screen)
  - Portrait layout (tall screen)
  - Responsive grid system
  - Component positioning configuration
  - Smooth transitions between layouts

#### 5. Keyboard Handler (Frontend)
- **Features:**
  - Listen to keyboard events from backend
  - Execute actions (next month, expand events, etc.)
  - Visual feedback for key presses
  - Remapping interface

## Project Structure

```
calvin/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── config.py               # Configuration management
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── calendar.py         # Calendar data models
│   │   │   ├── config.py           # Config models
│   │   │   └── keyboard.py         # Keyboard mapping models
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── calendar_service.py
│   │   │   ├── image_service.py
│   │   │   ├── keyboard_service.py
│   │   │   └── web_service.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── routes/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── calendar.py
│   │   │   │   ├── images.py
│   │   │   │   ├── keyboard.py
│   │   │   │   ├── web_services.py
│   │   │   │   └── config.py
│   │   │   └── websocket.py
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── calendar_parser.py
│   │       └── image_processor.py
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py             # Pytest configuration and fixtures
│   │   ├── unit/
│   │   │   ├── test_services/
│   │   │   └── test_utils/
│   │   ├── integration/
│   │   │   ├── test_api/
│   │   │   └── test_services_integration.py
│   │   ├── e2e/
│   │   └── fixtures/
│   ├── pyproject.toml              # UV project configuration
│   ├── uv.lock                     # UV lock file
│   ├── Dockerfile.dev              # Development Dockerfile
│   ├── .env.example
│   └── README.md
│
├── frontend/
│   ├── src/
│   │   ├── main.js                 # Vue app entry
│   │   ├── App.vue
│   │   ├── components/
│   │   │   ├── CalendarView.vue
│   │   │   ├── PhotoSlideshow.vue
│   │   │   ├── WebServiceViewer.vue
│   │   │   ├── LayoutManager.vue
│   │   │   └── KeyboardHandler.vue
│   │   ├── views/
│   │   │   ├── Dashboard.vue       # Main dashboard view
│   │   │   └── Settings.vue         # Settings/configuration view
│   │   ├── stores/
│   │   │   ├── calendar.js         # Pinia store for calendar
│   │   │   ├── images.js           # Pinia store for images
│   │   │   ├── keyboard.js         # Pinia store for keyboard
│   │   │   └── config.js           # Pinia store for config
│   │   ├── services/
│   │   │   ├── api.js              # API client
│   │   │   └── websocket.js        # WebSocket client
│   │   ├── composables/
│   │   │   ├── useCalendar.js
│   │   │   ├── useImages.js
│   │   │   └── useKeyboard.js
│   │   └── styles/
│   │       ├── main.css
│   │       ├── landscape.css
│   │       └── portrait.css
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── components/
│   │   │   ├── stores/
│   │   │   └── composables/
│   │   ├── integration/
│   │   └── e2e/
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   ├── vitest.config.js            # Vitest configuration
│   ├── Dockerfile.dev              # Development Dockerfile
│   └── README.md
│
├── config/
│   ├── default.yaml                # Default configuration
│   └── keyboard-mappings.json      # Keyboard action mappings
│
├── data/
│   ├── images/                     # Local image directory
│   └── db/                         # SQLite database location
│
├── image/
│   ├── cloud-init/
│   │   ├── user-data               # cloud-init configuration
│   │   └── meta-data                # cloud-init metadata
│   ├── first-boot/
│   │   ├── setup.sh                # First boot setup script
│   │   └── install-calvin.sh       # Calvin installation script
│   └── README.md                   # Image creation instructions
│
├── scripts/
│   ├── build-image.sh              # Build custom Raspberry Pi image
│   ├── setup-rpi.sh                # Manual setup script (alternative)
│   └── update.sh                   # Update script for deployed instances
│
├── .github/
│   └── workflows/
│       ├── ci.yml                  # CI/CD pipeline
│       └── release.yml             # Release workflow
│
├── .devcontainer/
│   ├── devcontainer.json           # VS Code dev container config
│   └── Dockerfile                  # Dev container Dockerfile
│
├── tests/
│   └── mocks/                      # Shared mock configurations
│       └── calendar-mock.json
│
├── docs/
│   ├── API.md                      # API documentation
│   ├── SETUP.md                    # Development setup instructions
│   ├── IMAGE_CREATION.md            # Raspberry Pi image creation guide
│   └── DEPLOYMENT.md                # Raspberry Pi deployment guide
│
├── .gitignore
├── .pre-commit-config.yaml        # Pre-commit hooks configuration
├── Makefile                        # Development commands
├── docker-compose.yml              # Development Docker Compose
├── docker-compose.test.yml         # Testing Docker Compose
└── README.md
```

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Set up project structure
- [ ] Initialize UV project for backend (pyproject.toml)
- [ ] Initialize FastAPI backend with basic endpoints
- [ ] Initialize Vue 3 frontend with Vite
- [ ] Set up basic routing and state management
- [ ] Create configuration system
- [ ] Implement basic layout manager (landscape/portrait)
- [ ] Set up testing infrastructure (pytest, vitest)
- [ ] Configure pre-commit hooks
- [ ] Set up Docker Compose for development
- [ ] Create Makefile with common commands
- [ ] Create image creation scripts and cloud-init config

### Phase 2: Calendar Integration (Week 2-3)
- [ ] Implement Google Calendar API integration
- [ ] Create calendar service backend
- [ ] Build calendar view component (frontend)
- [ ] Add calendar source management
- [ ] Implement basic calendar display (monthly view)
- [ ] Add event expansion functionality

### Phase 3: Image Slideshow (Week 3-4)
- [ ] Implement image scanning service
- [ ] Create image service backend endpoints
- [ ] Build photo slideshow component
- [ ] Add automatic rotation with intervals
- [ ] Implement image optimization
- [ ] Add EXIF orientation support

### Phase 4: Keyboard Control (Week 4-5)
- [ ] Implement keyboard input handler (backend)
- [ ] Create keyboard mapping system
- [ ] Build keyboard handler component (frontend)
- [ ] Implement key action system
- [ ] Add remapping interface
- [ ] Connect keyboard events to calendar/image actions

### Phase 5: Web Services Integration (Week 5-6)
- [ ] Implement web service management
- [ ] Create web service viewer component
- [ ] Add keyboard shortcuts for service switching
- [ ] Implement full-screen mode

### Phase 6: Polish & Optimization (Week 6-7)
- [ ] Add Proton Calendar integration (research API first)
- [ ] Optimize for Raspberry Pi performance
- [ ] Add error handling and logging
- [ ] Create settings/configuration UI
- [ ] Write comprehensive tests (unit, integration, e2e)
- [ ] Set up CI/CD pipeline (GitHub Actions)
- [ ] Achieve > 80% test coverage
- [ ] Write documentation
- [ ] Testing and bug fixes

## Configuration Schema

### Application Config (config.yaml)
```yaml
app:
  name: "Calvin"
  version: "1.0.0"
  debug: false

display:
  orientation: "landscape"  # landscape | portrait
  refresh_interval: 60      # seconds

calendar:
  refresh_interval: 300     # 5 minutes
  sources:
    - type: "google"
      id: "primary"
      name: "My Calendar"
      credentials_path: "config/google-credentials.json"
    - type: "proton"
      id: "proton-1"
      name: "Proton Calendar"
      api_key: "..."

images:
  directory: "data/images"
  rotation_interval: 30     # seconds
  supported_formats: ["jpg", "jpeg", "png", "webp"]
  max_size_mb: 10

keyboard:
  device: "auto"  # "auto" or "/dev/input/event0" - Auto-detect on Raspberry Pi
  type: "7-button"  # "7-button" or "standard" - Keyboard type
  mappings:
    # 7-button keyboard mappings (primary)
    "KEY_1": "calendar_next_month"
    "KEY_2": "calendar_prev_month"
    "KEY_3": "calendar_expand_today"
    "KEY_4": "images_next"
    "KEY_5": "images_prev"
    "KEY_6": "web_service_1"
    "KEY_7": "web_service_2"
    # Standard keyboard mappings (fallback/secondary)
    "KEY_RIGHT": "calendar_next_month"
    "KEY_LEFT": "calendar_prev_month"
    "KEY_UP": "calendar_expand_today"
    "KEY_DOWN": "calendar_collapse"
    "KEY_SPACE": "images_next"

web_services:
  - id: "shopping"
    name: "Shopping List"
    url: "https://example.com/shopping"
    fullscreen: true
  - id: "dinner"
    name: "Dinner Planning"
    url: "https://example.com/dinner"
    fullscreen: true
```

## Key Design Decisions

### 1. Backend-Frontend Separation
- **Rationale**: Allows independent scaling, easier testing, and potential for mobile app later
- **Communication**: REST API + WebSocket for real-time updates

### 2. FastAPI over Flask
- **Rationale**: Modern async support, automatic API docs, better performance
- **Alternative**: Flask if more familiar, but FastAPI recommended

### 3. Vue 3 Composition API
- **Rationale**: Better TypeScript support, cleaner code organization, modern Vue patterns
- **State Management**: Pinia (official Vue state management)

### 4. SQLite for Configuration
- **Rationale**: Lightweight, no separate server needed, perfect for Raspberry Pi
- **Alternative**: JSON files for simpler config, but SQLite better for complex queries

### 5. Keyboard Input via evdev
- **Rationale**: Direct hardware access on Linux, works without X server
- **Alternative**: Web-based keyboard events if running in browser, but less reliable

### 6. Image Optimization
- **Rationale**: Raspberry Pi has limited resources, optimize images server-side
- **Strategy**: Resize to display resolution, convert to WebP, cache processed images

## Raspberry Pi Image Creation

### Strategy: Custom Pre-configured Image

We'll create a custom Raspberry Pi image that includes:
- Raspberry Pi OS Lite (headless, minimal footprint)
- Pre-installed dependencies (Python 3.11+, Node.js, Chromium)
- Calvin application pre-installed
- WiFi configuration via cloud-init
- Auto-start services configured
- First-boot setup script for final configuration

### Image Creation Methods

#### Method 1: Raspberry Pi Imager with Custom Config (Recommended - Simplest)
- Use official Raspberry Pi Imager
- Add custom cloud-init configuration
- Pre-configure WiFi, SSH, and initial setup
- Flash SD card with pre-configured image

#### Method 2: Build Custom Image with pi-gen
- Fork/clone `pi-gen` (Raspberry Pi OS image builder)
- Add custom stage with Calvin installation
- Build complete custom image
- More complex but fully customizable

#### Method 3: Post-Install Script (Simplest Alternative)
- Use standard Raspberry Pi OS image
- Run automated setup script on first boot
- Configure WiFi and install Calvin
- Less elegant but easier to maintain

**We'll implement Method 1** (Raspberry Pi Imager + cloud-init) as it's the simplest and most user-friendly.

### Image Contents

The custom image will include:
1. **Base System**: Raspberry Pi OS Lite (64-bit recommended)
2. **System Packages**:
   - Python 3.11+ (or latest available)
   - Node.js 20+ (via NodeSource repository)
   - Chromium browser
   - UV (Python package manager)
   - Git
   - Network utilities
3. **Calvin Application**:
   - Backend and frontend code
   - Systemd service files
   - Configuration templates
4. **Auto-Configuration**:
   - WiFi setup via cloud-init
   - SSH key configuration
   - First-boot setup script
   - Auto-start services

### Setup Process

1. **Image Creation** (on development machine):
   - Use Raspberry Pi Imager
   - Configure cloud-init with WiFi credentials
   - Add custom first-boot script
   - Flash to SD card

2. **First Boot** (on Raspberry Pi):
   - Boot with SD card
   - cloud-init configures WiFi and SSH
   - First-boot script runs:
     - Installs UV and Node.js (if not in image)
     - Installs Python dependencies via UV
     - Installs frontend dependencies
     - Builds frontend
     - Configures systemd services
     - Sets up auto-start
   - Reboots into kiosk mode

3. **Runtime**:
   - Backend starts automatically via systemd
   - Chromium opens in kiosk mode on boot
   - Dashboard displays automatically

## Raspberry Pi Considerations

### Hardware Baseline: Pi 3B+ Performance Considerations
- **CPU**: 1.4GHz quad-core ARM Cortex-A53 (64-bit)
- **RAM**: 1GB LPDDR2
- **Performance**: Lower than Pi 4/5, but sufficient for dashboard use
- **Optimizations Needed**:
  - Lightweight image formats (WebP)
  - Aggressive image caching
  - Limit concurrent operations
  - Optimize frontend bundle size
  - Use async/await for I/O operations
  - Minimize memory footprint

### Performance Optimization
- Use lightweight image formats (WebP)
- Implement image caching (1GB cache limit)
- Limit concurrent API requests (max 3 concurrent)
- Use async/await for I/O operations
- Use UV for faster Python package installation
- Optimize frontend bundle (code splitting, tree shaking)
- Consider using a lightweight web server (nginx) as reverse proxy (optional)
- Monitor memory usage (1GB RAM limit on Pi 3B+)

### Display Setup
- Run in kiosk mode (Chromium)
- Auto-start on boot via systemd
- Handle display rotation (hardware vs software)
- Power management (disable screen saver)
- Auto-hide cursor after inactivity

### Deployment
- Create systemd service for backend
- Auto-start frontend in kiosk mode
- Handle network connectivity issues gracefully
- Log rotation for debugging
- Health check endpoint for monitoring
- Automatic recovery on service failure

## Image Creation Details

### Cloud-Init Configuration

The image will use cloud-init for initial WiFi and system configuration:

**user-data** (cloud-init):
```yaml
#cloud-config
hostname: calvin-dashboard
users:
  - name: calvin
    groups: sudo, audio, video
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    ssh_authorized_keys:
      - ssh-rsa YOUR_PUBLIC_KEY_HERE

# WiFi configuration
wifi:
  networks:
    - name: "YourWiFiSSID"
      password: "YourWiFiPassword"
      priority: 1

# Enable SSH
ssh:
  allow_public_ssh_keys: true
  disable_root: true

# Run first-boot script
runcmd:
  - /home/calvin/calvin/first-boot/setup.sh
```

### First-Boot Setup Script

The first-boot script will:
1. Install UV (if not in image)
2. Install Node.js (if not in image)
3. Install Python dependencies via UV
4. Install frontend dependencies
5. Build frontend for production
6. Create systemd service files
7. Enable and start services
8. Configure Chromium kiosk mode
9. Set up auto-start on boot

### Systemd Services

**calvin-backend.service:**
```ini
[Unit]
Description=Calvin Dashboard Backend
After=network.target

[Service]
Type=simple
User=calvin
WorkingDirectory=/home/calvin/calvin/backend
ExecStart=/home/calvin/.local/bin/uv run python -m app.main
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**calvin-frontend.service:**
```ini
[Unit]
Description=Calvin Dashboard Frontend (Kiosk Mode)
After=network.target calvin-backend.service
Requires=calvin-backend.service

[Service]
Type=simple
User=calvin
Environment=DISPLAY=:0
ExecStart=/usr/bin/chromium-browser --kiosk --noerrdialogs --disable-infobars --autoplay-policy=no-user-gesture-required http://localhost:8000
Restart=always
RestartSec=10

[Install]
WantedBy=graphical.target
```

## DevOps & Testing Infrastructure

### Development Environment

#### Local Development Setup
- **Docker Compose**: For running full stack locally
- **Dev Containers**: VS Code dev container support
- **Hot Reload**: FastAPI auto-reload + Vite HMR
- **Environment Variables**: `.env` files for local config
- **Mock Services**: Local mocks for external APIs (Google Calendar, etc.)

#### Development Tools
- **Pre-commit Hooks**: Run linters, formatters, and tests before commit
- **Makefile**: Common development commands
- **Task Runner**: UV scripts + npm scripts for unified commands

### Testing Strategy

#### Backend Testing
- **pytest**: Primary testing framework
- **pytest-asyncio**: Async test support for FastAPI
- **pytest-cov**: Code coverage reporting
- **httpx**: Async HTTP client for testing FastAPI endpoints
- **faker**: Generate test data
- **pytest-mock**: Mocking external services
- **factory-boy**: Test fixtures and factories

**Test Structure:**
```
backend/
├── tests/
│   ├── __init__.py
│   ├── conftest.py              # Pytest configuration and fixtures
│   ├── unit/
│   │   ├── test_services/
│   │   │   ├── test_calendar_service.py
│   │   │   ├── test_image_service.py
│   │   │   └── test_keyboard_service.py
│   │   └── test_utils/
│   ├── integration/
│   │   ├── test_api/
│   │   │   ├── test_calendar_routes.py
│   │   │   ├── test_image_routes.py
│   │   │   └── test_keyboard_routes.py
│   │   └── test_services_integration.py
│   ├── e2e/
│   │   └── test_full_workflow.py
│   └── fixtures/
│       ├── calendar_events.json
│       └── test_images/
```

#### Frontend Testing
- **Vitest**: Fast unit testing (Vite-native)
- **Vue Test Utils**: Vue component testing utilities
- **@testing-library/vue**: Component testing best practices
- **@vue/test-utils**: Vue-specific testing helpers
- **MSW (Mock Service Worker)**: Mock API responses
- **Playwright**: E2E testing (optional, for critical flows)

**Test Structure:**
```
frontend/
├── src/
└── tests/
    ├── unit/
    │   ├── components/
    │   │   ├── CalendarView.spec.js
    │   │   ├── PhotoSlideshow.spec.js
    │   │   └── LayoutManager.spec.js
    │   ├── stores/
    │   │   ├── calendar.spec.js
    │   │   └── images.spec.js
    │   └── composables/
    ├── integration/
    │   └── api.spec.js
    └── e2e/
        └── dashboard.spec.js
```

### Code Quality Tools

#### Backend
- **ruff**: Fast Python linter and formatter (replaces black, flake8, isort)
- **mypy**: Static type checking
- **pydantic**: Runtime type validation (already in dependencies)
- **bandit**: Security linting

#### Frontend
- **ESLint**: JavaScript/TypeScript linting
- **Prettier**: Code formatting
- **Vue ESLint Plugin**: Vue-specific linting rules
- **TypeScript** (optional): Type safety

### CI/CD Pipeline

#### GitHub Actions Workflow
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - name: Install dependencies
        run: uv sync
      - name: Lint
        run: uv run ruff check .
      - name: Type check
        run: uv run mypy app/
      - name: Security check
        run: uv run bandit -r app/
      - name: Run tests
        run: uv run pytest --cov=app --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Type check
        run: npm run type-check
      - name: Run tests
        run: npm run test
      - name: Build
        run: npm run build

  integration-tests:
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-tests]
    steps:
      - uses: actions/checkout@v4
      - name: Run integration tests
        run: make test-integration

  build-image:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    needs: [backend-tests, frontend-tests, integration-tests]
    steps:
      - uses: actions/checkout@v4
      - name: Build Raspberry Pi image
        run: ./scripts/build-image.sh
```

### Docker & Containerization

#### Development Docker Compose
```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    volumes:
      - ./backend:/app
      - backend-venv:/app/.venv
    ports:
      - "8000:8000"
    environment:
      - ENV=development
      - DATABASE_URL=sqlite:///./data/db/calvin.db
    command: uv run uvicorn app.main:app --reload --host 0.0.0.0

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:8000
    command: npm run dev

  mock-calendar:
    image: mockserver/mockserver
    ports:
      - "1080:1080"
    volumes:
      - ./tests/mocks/calendar-mock.json:/config/calendar-mock.json

volumes:
  backend-venv:
```

### Pre-commit Hooks

**Configuration (.pre-commit-config.yaml):**
```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-added-large-files

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.6
    hooks:
      - id: ruff
        args: [--fix, --exit-non-zero-on-fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.7.1
    hooks:
      - id: mypy
        additional_dependencies: [types-all]

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0-alpha.8
    hooks:
      - id: prettier
        files: ^frontend/

  - repo: local
    hooks:
      - id: backend-tests
        name: Backend Tests
        entry: uv run pytest
        language: system
        pass_filenames: false
        always_run: true

      - id: frontend-tests
        name: Frontend Tests
        entry: npm run test
        language: system
        pass_filenames: false
        always_run: true
```

### Mock Services for Testing

#### Calendar API Mock
- **Mock Google Calendar API**: Local mock server using mockserver
- **Mock Proton Calendar API**: Custom mock implementation
- **Test Fixtures**: Pre-defined calendar events for testing

#### Image Service Mock
- **Test Image Directory**: Sample images for testing
- **Mock Image Processing**: Fast image processing for tests

### Test Data & Fixtures

#### Backend Fixtures
- Calendar event fixtures (JSON)
- Image fixtures (sample photos)
- Configuration fixtures
- Database fixtures

#### Frontend Fixtures
- Mock API responses
- Test calendar data
- Test image URLs
- Mock keyboard events

### Development Scripts

#### Makefile
```makefile
.PHONY: help install test lint format type-check dev build clean

help:
	@echo "Available commands:"
	@echo "  make install    - Install all dependencies"
	@echo "  make dev        - Start development servers"
	@echo "  make test       - Run all tests"
	@echo "  make lint       - Run linters"
	@echo "  make format     - Format code"
	@echo "  make type-check - Run type checkers"
	@echo "  make build      - Build for production"
	@echo "  make clean      - Clean build artifacts"

install:
	cd backend && uv sync
	cd frontend && npm install

dev:
	docker-compose up

test:
	cd backend && uv run pytest
	cd frontend && npm run test

test-backend:
	cd backend && uv run pytest

test-frontend:
	cd frontend && npm run test

test-integration:
	cd backend && uv run pytest tests/integration
	cd frontend && npm run test:integration

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint

format:
	cd backend && uv run ruff format .
	cd frontend && npm run format

type-check:
	cd backend && uv run mypy app/
	cd frontend && npm run type-check

build:
	cd backend && uv run python -m build
	cd frontend && npm run build

clean:
	rm -rf backend/.venv
	rm -rf frontend/node_modules
	rm -rf frontend/dist
	find . -type d -name __pycache__ -exec rm -r {} +
	find . -type f -name "*.pyc" -delete
```

### Environment Management

#### Development vs Production
- **Development**: `.env.development` - Local development config
- **Testing**: `.env.test` - Test environment config
- **Production**: `.env.production` - Production config (not in repo)
- **Example**: `.env.example` - Template for environment variables

#### Configuration Files
```
config/
├── development.yaml
├── test.yaml
├── production.yaml
└── default.yaml
```

### Testing Best Practices

#### Unit Tests
- **Isolation**: Each test is independent
- **Mocking**: External services are mocked
- **Fast**: Unit tests run quickly (< 1 second total)
- **Coverage**: Aim for > 80% code coverage

#### Integration Tests
- **Real Services**: Test with real database, but mocked external APIs
- **API Testing**: Test full request/response cycles
- **Service Integration**: Test service interactions

#### E2E Tests
- **Critical Paths**: Test main user workflows
- **Real Environment**: Run against real backend (test instance)
- **Selective**: Only test critical user journeys

### Monitoring & Observability

#### Development
- **Structured Logging**: JSON logs for easy parsing
- **Log Levels**: DEBUG, INFO, WARNING, ERROR
- **Request Logging**: Log all API requests/responses in dev

#### Production
- **Health Checks**: `/health` endpoint for monitoring
- **Metrics**: Basic metrics endpoint (optional)
- **Error Tracking**: Structured error logging

### Updated Dependencies

#### Backend Testing Dependencies
```toml
[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.21.0",
    "pytest-cov>=4.1.0",
    "pytest-mock>=3.12.0",
    "httpx>=0.25.0",
    "faker>=20.0.0",
    "factory-boy>=3.3.0",
    "ruff>=0.1.6",
    "mypy>=1.7.0",
    "bandit>=1.7.5",
    "pre-commit>=3.5.0",
]
```

#### Frontend Testing Dependencies
```json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vue/test-utils": "^2.4.0",
    "@testing-library/vue": "^8.0.0",
    "@testing-library/jest-dom": "^6.1.0",
    "msw": "^2.0.0",
    "playwright": "^1.40.0",
    "eslint": "^8.55.0",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "prettier": "^3.1.0",
    "@vue/eslint-config-prettier": "^9.0.0"
  }
}
```

## Next Steps

1. **Review this plan** and adjust based on preferences
2. **Set up development environment**:
   - Python 3.11+ (or latest available)
   - Node.js 20+ (or latest LTS)
   - UV (Python package manager)
   - Git
3. **Initialize project structure** with basic scaffolding
4. **Create image creation scripts** and cloud-init templates
5. **Start with Phase 1** - Foundation setup
6. **Iterate** through phases, testing on Raspberry Pi as you go

## Questions to Consider

1. **Proton Calendar API**: Does Proton provide a public API, or will we need to reverse engineer?
2. **Authentication**: How to handle Google Calendar OAuth on headless Raspberry Pi?
3. **Display Hardware**: What display will be used? (affects resolution, touch support)
4. **Network**: Will this always be on local network, or need remote access?
5. **Updates**: How to handle software updates on Raspberry Pi?

## Dependencies (Initial)

### Backend (pyproject.toml for UV)
```toml
[project]
name = "calvin-backend"
version = "0.1.0"
description = "Calvin Dashboard Backend"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.104.1",
    "uvicorn[standard]>=0.24.0",
    "python-dotenv>=1.0.0",
    "google-api-python-client>=2.100.0",
    "google-auth-httplib2>=0.1.1",
    "google-auth-oauthlib>=1.1.0",
    "APScheduler>=3.10.4",
    "Pillow>=10.1.0",
    "evdev>=1.6.1",
    "aiofiles>=23.2.1",
    "sqlalchemy>=2.0.23",
    "aiosqlite>=0.19.0",
    "pydantic>=2.5.0",
    "pydantic-settings>=2.1.0",
    "websockets>=12.0",
]
```

**Installation with UV:**
```bash
# Install UV (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync

# Run application
uv run python -m app.main
```

### Frontend (package.json)
```json
{
  "name": "calvin-frontend",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "vue": "^3.4.0",
    "pinia": "^2.1.7",
    "vue-router": "^4.2.5",
    "axios": "^1.6.0",
    "@vueuse/core": "^10.7.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

**Installation:**
```bash
# Using npm (or pnpm/yarn)
npm install

# Development
npm run dev

# Production build
npm run build
```

## Pre-Implementation Decisions

Before starting implementation, we should finalize these decisions:

### 1. Base OS Selection

#### Option A: Raspberry Pi OS Lite (64-bit) - **SELECTED**
- **Pros:**
  - Modern 64-bit support (better for Python 3.11+, Node.js 20+)
  - Minimal footprint (~2GB base image)
  - Headless by default (no desktop overhead)
  - Official Raspberry Pi Foundation support
  - Full compatibility with modern tooling (UV, etc.)
  - Works on Pi 3B+ (tested and supported)

- **Cons:**
  - Slightly larger than 32-bit (but still minimal)
  - May have slightly lower performance on Pi 3B+ vs Pi 4/5

#### Option B: Raspberry Pi OS Lite (32-bit)
- **Pros:**
  - Works on older Pi models (Pi Zero, Pi 2)
  - Smaller image size
  - Slightly better performance on Pi 3B+ (marginal)
  - More compatible with older hardware

- **Cons:**
  - Limited to older Python/Node.js versions
  - May have compatibility issues with modern packages
  - Less future-proof
  - UV may have limited support

#### Option C: Raspberry Pi OS Desktop (64-bit)
- **Pros:**
  - Includes desktop environment
  - Easier debugging with GUI tools
  - Built-in display management

- **Cons:**
  - Much larger image (~4GB+)
  - Unnecessary overhead for kiosk mode
  - Slower boot time
  - More resource usage (not ideal for Pi 3B+)

**Decision: Raspberry Pi OS Lite (64-bit)** - Selected for Pi 3B+ baseline. Provides modern tooling support while maintaining minimal footprint. Pi 3B+ is 64-bit capable and will work well with this OS.

### 2. Update Mechanism

How will deployed devices receive updates?

#### Option A: Git Pull + Restart Service
- Simple: SSH in, pull latest, restart services
- Manual control
- Requires SSH access

#### Option B: Automated Update Script
- Scheduled checks for updates
- Automatic pull and restart
- Can include rollback mechanism
- Requires network access

#### Option C: Image Re-flash
- Most reliable
- Requires physical access
- Complete system reset

**Recommendation: Option B (Automated Update Script)** with manual override option.

### 3. Authentication & Security

#### Google Calendar OAuth on Headless Device
- **Challenge**: OAuth flow requires browser interaction
- **Solution Options:**
  1. **Initial Setup on Desktop**: Generate tokens on desktop, transfer to Pi
  2. **OAuth Proxy**: Web interface on Pi for initial auth (one-time setup)
  3. **Service Account**: Use service account instead of OAuth (if available)
  4. **Token Refresh**: Store refresh token, auto-refresh access token

**Recommendation: Option 2 (OAuth Proxy)** - One-time web-based auth during setup, then auto-refresh.

#### Security Considerations
- SSH key-only authentication (disable password)
- Firewall rules (only allow necessary ports)
- Regular security updates
- Secrets management (credentials stored securely)
- HTTPS for local network? (optional, adds complexity)

### 4. Display Hardware Assumptions

**Hardware Specifications:**
- **Device**: Raspberry Pi 3B+ (baseline)
- **Display**: Standard HDMI display
- **Resolution**: 1080p (HDMI standard, configurable)
- **Touch Support**: No (keyboard-only navigation)
- **Orientation**: Software rotation support (landscape/portrait)
- **Multiple Displays**: Single display (initial version)

**Display Features:**
- HDMI output (standard)
- Software-based rotation (landscape ↔ portrait)
- Resolution auto-detection
- Display power management (disable screen saver)

### 5. Network Requirements

#### Local Network Only
- Simpler security model
- No external dependencies
- Faster response times
- Requires local network access for setup

#### Remote Access (Optional)
- Access from outside home network
- VPN or reverse proxy required
- Additional security considerations
- More complex setup

**Recommendation: Local network only** for initial version, with optional remote access as future enhancement.

### 6. Data Persistence & Backup

#### What Needs to Persist?
- Calendar credentials and tokens
- Configuration settings
- Keyboard mappings
- Image metadata/index
- Web service URLs

#### Backup Strategy
- **Option A**: Periodic config backup to external drive
- **Option B**: Cloud backup (optional)
- **Option C**: Git-based config versioning
- **Option D**: No backup (reconfigure on failure)

**Recommendation: Option A + C** - Local backups + Git for config versioning.

### 7. Logging Strategy

#### Log Storage
- **Location**: `/var/log/calvin/` or `~/.calvin/logs/`
- **Rotation**: Daily rotation, keep 7 days
- **Format**: JSON for structured logging
- **Levels**: DEBUG (dev), INFO (prod)

#### Log Access
- **Development**: Console output
- **Production**: File-based with rotation
- **Remote**: Optional syslog forwarding

### 8. State Management

#### What State Needs Persistence?
- Current image index (slideshow position)
- Calendar cache (with TTL)
- Keyboard device selection
- Layout preferences
- Last viewed date/month

#### Storage
- **SQLite**: Configuration and state
- **File System**: Image cache, logs
- **Memory**: Current session state

### 9. Image Storage Strategy

#### Storage Location
- **Option A**: Local SD card (`/home/calvin/calvin/data/images/`)
- **Option B**: External USB drive
- **Option C**: Network share (NFS/SMB)
- **Option D**: Cloud storage (future)

**Recommendation: Option A** for initial version, with support for Option B/C as configurable.

#### Image Limits
- Max image size: 10MB (configurable)
- Max total storage: Unlimited (SD card size)
- Cache size: 1GB for processed images

### 10. Calendar Sync Frequency

#### Sync Strategy
- **Initial Load**: On startup
- **Periodic Sync**: Every 5 minutes (configurable)
- **Event-Driven**: Webhook support (future)
- **Cache**: 1 hour TTL for events

#### Error Handling
- Retry with exponential backoff
- Fallback to cached data
- User notification on sync failure

### 11. Keyboard Device Detection & Support

#### Hardware Specifications
- **Primary**: 7-button keyboard (compact, custom)
- **Secondary**: Standard full-size keyboards (also supported)
- **Detection**: Auto-detect on startup, manual override available

#### Keyboard Support Strategy
- **Auto-Detection**: Scan `/dev/input/event*` on startup
- **Device Filtering**: Identify keyboard devices (evdev)
- **Multiple Keyboards**: Support multiple keyboards (use first found, or allow selection)
- **Manual Override**: Config file allows manual device specification

#### 7-Button Keyboard Mapping
- **Default Mapping** (configurable):
  - Button 1: Calendar - Next Month
  - Button 2: Calendar - Previous Month
  - Button 3: Calendar - Expand Today's Events
  - Button 4: Images - Next Image
  - Button 5: Images - Previous Image
  - Button 6: Web Service - Switch to Service 1
  - Button 7: Web Service - Switch to Service 2

#### Full Keyboard Support
- **Standard Keys**: Arrow keys, space, number keys, etc.
- **Remappable**: All keys can be remapped via configuration
- **Default Mappings**: Sensible defaults for standard keyboards
- **Custom Mappings**: User-defined key → action mappings

#### Fallback Behavior
- If no keyboard found: Disable keyboard features, log warning, continue
- If keyboard disconnected: Log warning, attempt reconnection
- Graceful degradation: System continues to function without keyboard

#### Keyboard Configuration
```yaml
keyboard:
  device: "auto"  # "auto" or "/dev/input/event0"
  type: "7-button"  # "7-button" or "standard"
  mappings:
    # 7-button keyboard mappings
    "KEY_1": "calendar_next_month"
    "KEY_2": "calendar_prev_month"
    "KEY_3": "calendar_expand_today"
    "KEY_4": "images_next"
    "KEY_5": "images_prev"
    "KEY_6": "web_service_1"
    "KEY_7": "web_service_2"
    # Standard keyboard mappings (if type is "standard")
    "KEY_RIGHT": "calendar_next_month"
    "KEY_LEFT": "calendar_prev_month"
    "KEY_UP": "calendar_expand_today"
    "KEY_DOWN": "calendar_collapse"
    "KEY_SPACE": "images_next"
```

### 12. API Versioning

#### Strategy
- **Initial**: No versioning (v1 implicit)
- **Future**: `/api/v1/`, `/api/v2/` when breaking changes needed
- **Documentation**: OpenAPI/Swagger docs

### 13. Frontend Build Strategy

#### SPA (Single Page Application) - **SELECTED**
- Simple deployment
- Fast navigation
- Works well for kiosk mode
- No SSR complexity

#### Build Output
- Static files served by FastAPI
- Or separate nginx (optional, adds complexity)
- **Recommendation**: Serve from FastAPI for simplicity

### 14. Error Handling & User Feedback

#### Error Display
- **Development**: Detailed error messages
- **Production**: User-friendly messages
- **Logging**: Full error details in logs

#### User Feedback
- Toast notifications for errors
- Loading states for async operations
- Offline indicator when backend unavailable

### 15. Health Monitoring

#### Health Check Endpoint
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system status
- Response: `{"status": "healthy", "services": {...}}`

#### Monitoring
- Systemd service status
- Disk space monitoring
- Memory usage tracking
- Network connectivity check

### 16. Development Workflow

#### Branch Strategy
- **main**: Production-ready code
- **develop**: Integration branch
- **feature/***: Feature branches
- **hotfix/***: Emergency fixes

#### Release Strategy
- Semantic versioning (v1.0.0)
- Tagged releases
- Changelog generation
- Image builds on release tags

## Recommended Decisions Summary

1. **Hardware Baseline**: Raspberry Pi 3B+ with standard HDMI display
2. **Base OS**: Raspberry Pi OS Lite (64-bit)
3. **Display**: Standard HDMI, 1080p, software rotation (landscape/portrait)
4. **Keyboard**: 7-button keyboard (primary) + full keyboard support (secondary)
5. **Updates**: Automated update script with manual override
6. **Auth**: OAuth proxy for initial setup, auto-refresh tokens
7. **Network**: Local network only (initial)
8. **Backup**: Local backups + Git versioning
9. **Logging**: JSON logs, daily rotation, 7-day retention
10. **State**: SQLite for config/state, file system for cache
11. **Images**: Local SD card storage, 10MB max per image
12. **Calendar Sync**: 5-minute intervals, 1-hour cache TTL
13. **Keyboard Detection**: Auto-detect with manual override, support both 7-button and standard keyboards
14. **API**: No versioning initially, add when needed
15. **Frontend**: SPA served by FastAPI
16. **Errors**: User-friendly messages, detailed logs
17. **Health**: `/health` endpoint for monitoring
18. **Workflow**: Git Flow with semantic versioning

---

**Ready to start implementation?** Review these decisions and let me know if you'd like to adjust anything, or if you're ready to begin with Phase 1!

