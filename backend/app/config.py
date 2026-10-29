"""Configuration management."""

from pathlib import Path

from loguru import logger
from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ — where alembic.ini, the shipped built-in themes and (by default)
# the data dir live. Derived from this file, never from the working dir.
BACKEND_DIR = Path(__file__).resolve().parent.parent

# Path settings that default to <data_dir>/<default> unless set explicitly.
_DATA_PATHS = (
    "log_dir",
    "image_dir",
    "image_cache_dir",
    "plugins_dir",
    "themes_dir",
    "kiosk_signing_key_path",
    "backup_dir",
)


def resolve_path(path: Path) -> Path:
    """Absolute path; relative ones are taken from the backend dir, not the cwd."""
    path = Path(path).expanduser()
    return path if path.is_absolute() else (BACKEND_DIR / path).resolve()


class Settings(BaseSettings):
    """Application settings."""

    # Environment
    env: str = "development"
    debug: bool = True

    # API
    api_host: str = "0.0.0.0"  # nosec B104 - intentional: Pi serves the LAN
    api_port: int = 8000

    # Data directory: the root of everything Calvin writes (DB, images,
    # plugins, themes, caches, logs, kiosk signing key, backups). Read from
    # CALVIN_DATA_DIR; the default is backend/data of this checkout, so a
    # dev or bare-metal install never depends on the working directory.
    # Each path below can still be overridden on its own (DATABASE_URL,
    # IMAGE_DIR, PLUGIN_DIR, ...); unset ones derive from data_dir. Relative
    # values resolve against the backend dir (the historical working dir).
    data_dir: Path = Field(
        default=BACKEND_DIR / "data",
        validation_alias=AliasChoices("calvin_data_dir", "data_dir"),
    )

    # Database (default: sqlite:///<data_dir>/db/calvin.db)
    database_url: str = ""

    @property
    def database_path(self) -> Path:
        """Get the absolute path to the database file."""
        db_path_str = self.database_url.replace("sqlite:///", "").replace(
            "sqlite+aiosqlite:///", ""
        )
        return resolve_path(Path(db_path_str))

    @property
    def database_url_absolute(self) -> str:
        """Get the database URL with absolute path."""
        return f"sqlite:///{self.database_path}"

    # Logging
    log_level: str = "INFO"
    log_dir: Path = Path("logs")

    # Image Storage
    image_dir: Path = Path("images")
    # Remote image bytes cache (app.services.remote_image_cache)
    image_cache_dir: Path = Path("image_cache")

    # Plugin Storage.
    # Deploy configs (docker compose, deploy/calvin.env.example) set the
    # singular PLUGIN_DIR, so accept it alongside the convention-following
    # PLUGINS_DIR. Without this the env is silently ignored and container
    # installs fall back to ./data/plugins inside the bind-mounted repo,
    # creating root-owned dirs that break a host-run backend. (calvin-0ds)
    plugins_dir: Path = Field(
        default=Path("plugins"),
        validation_alias=AliasChoices("plugins_dir", "plugin_dir"),
    )

    # Installed (uploaded) themes. Built-in themes ship with the code.
    themes_dir: Path = Path("themes")

    # Photo Frame Mode
    photo_frame_enabled: bool = False
    photo_frame_timeout: int = 300  # seconds (5 minutes default)

    # CORS
    cors_origins: str = (
        "http://localhost:5173,http://localhost:8000"  # Comma-separated list of allowed origins
    )
    cors_allow_all: bool = (
        False  # Allow all origins (development only, not recommended for production)
    )

    # How the backend is deployed: "native" (host install with update/restart
    # scripts) or "docker" (set by docker/Dockerfile). In a container the host
    # actions — update script, systemd restarts, reboot — don't apply.
    deployment: str = Field(
        default="native",
        validation_alias=AliasChoices("calvin_deployment", "deployment"),
    )

    # System paths (for Raspberry Pi deployment)
    update_script_path: Path = Path("/usr/local/bin/update-calvin.sh")
    repo_dir: Path = Path("/home/calvin/calvin")
    system_path: str = "/home/calvin/.local/bin:/usr/local/bin:/usr/bin:/bin"
    kiosk_signing_key_path: Path = Path("kiosk-signing.key")
    # Where the kiosk bundle + installer scripts live (deploy/, scripts/ layout).
    # Unset = repo_dir (a Pi/source checkout); the Docker image sets it explicitly.
    kiosk_bundle_dir: Path | None = None

    # Backups (calvin-8gx)
    backup_dir: Path = Path("backups")

    @model_validator(mode="after")
    def _derive_paths(self) -> "Settings":
        """Anchor unset paths under data_dir and make every path absolute."""
        self.data_dir = resolve_path(self.data_dir)
        defaults = type(self).model_fields
        for name in _DATA_PATHS:
            value = getattr(self, name)
            # An empty env value (BACKUP_DIR=) parses as "." and counts as unset.
            if name not in self.model_fields_set or value == Path("."):
                setattr(self, name, self.data_dir / defaults[name].default)
            else:
                setattr(self, name, resolve_path(value))
        if not self.database_url:
            self.database_url = f"sqlite:///{self.data_dir / 'db' / 'calvin.db'}"
        elif self.database_url.startswith(("sqlite:///", "sqlite+aiosqlite:///")):
            self.database_url = self.database_url_absolute
        return self

    @property
    def is_dev_mode(self) -> bool:
        """Check if running in development mode by looking for .dev marker file."""
        # Check repo_dir-relative path (production Pi path)
        if (self.repo_dir / "backend" / ".dev").exists():
            return True
        # Also check relative to this file, so it works without setting REPO_DIR in dev
        return (Path(__file__).parent.parent / ".dev").exists()

    def get_update_script_path(self) -> Path:
        """Get the appropriate update script path based on dev/prod mode."""
        if self.is_dev_mode:
            # Development mode: use dev update script
            dev_script = Path("/usr/local/bin/update-calvin-dev.sh")
            if dev_script.exists():
                return dev_script
            # Fallback to generic script if dev-specific doesn't exist
            return self.update_script_path
        else:
            # Production mode: use prod update script
            prod_script = Path("/usr/local/bin/update-calvin-prod.sh")
            if prod_script.exists():
                return prod_script
            # Fallback to generic script if prod-specific doesn't exist
            return self.update_script_path

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        env_prefix="",
    )

    def __init__(self, **kwargs):
        """Initialize settings and create directories."""
        super().__init__(**kwargs)
        # Create necessary directories
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.image_cache_dir.mkdir(parents=True, exist_ok=True)
        self.plugins_dir.mkdir(parents=True, exist_ok=True)
        self.themes_dir.mkdir(parents=True, exist_ok=True)
        # Extract database path and ensure directory exists
        # Use the database_path property to get absolute path
        db_path = self.database_path
        db_path.parent.mkdir(parents=True, exist_ok=True)

        # Migrate database from old incorrect location if it exists
        # Check for common incorrect paths (double path issue)
        if not db_path.exists():
            # Check for database in wrong location (double path)
            wrong_paths = [
                Path("/home/calvin/calvin/backend/home/calvin/calvin/backend/data/db/calvin.db"),
                Path.cwd() / "home" / "calvin" / "calvin" / "backend" / "data" / "db" / "calvin.db",
            ]
            for wrong_path in wrong_paths:
                if wrong_path.exists():
                    logger.info(f"Found database at incorrect location: {wrong_path}")
                    logger.info(f"Migrating to correct location: {db_path}")
                    try:
                        # Ensure target directory exists
                        db_path.parent.mkdir(parents=True, exist_ok=True)
                        # Copy database file
                        import shutil

                        shutil.copy2(wrong_path, db_path)
                        logger.info(f"Database migrated successfully to {db_path}")
                        # Old file is kept for safety - user can remove manually if needed
                    except Exception:
                        logger.opt(exception=True).warning("Failed to migrate database")
                    break


# Global settings instance
settings = Settings()
