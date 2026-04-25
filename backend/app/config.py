"""Configuration management."""

import logging
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings."""

    # Environment
    env: str = "development"
    debug: bool = True

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Database
    # Use absolute path to avoid path resolution issues
    database_url: str = "sqlite:///./data/db/calvin.db"

    @property
    def database_path(self) -> Path:
        """Get the absolute path to the database file."""
        db_path_str = self.database_url.replace("sqlite:///", "").replace(
            "sqlite+aiosqlite:///", ""
        )
        # Remove leading ./ if present
        if db_path_str.startswith("./"):
            db_path_str = db_path_str[2:]
        # If path starts with /, it's already absolute
        if db_path_str.startswith("/"):
            return Path(db_path_str)
        # Otherwise resolve relative to backend directory
        # Find backend directory (where this config file is located)
        backend_dir = Path(__file__).parent.parent
        return (backend_dir / db_path_str).resolve()

    @property
    def database_url_absolute(self) -> str:
        """Get the database URL with absolute path."""
        return f"sqlite:///{self.database_path}"

    # Logging
    log_level: str = "INFO"
    log_dir: Path = Path("./logs")

    # Image Storage
    image_dir: Path = Path("./data/images")
    image_cache_dir: Path = Path("./data/cache/images")

    # Plugin Storage
    plugins_dir: Path = Path("./data/plugins")

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

    # System paths (for Raspberry Pi deployment)
    update_script_path: Path = Path("/usr/local/bin/update-calvin.sh")
    repo_dir: Path = Path("/home/calvin/calvin")
    system_path: str = "/home/calvin/.local/bin:/usr/local/bin:/usr/bin:/bin"

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
                    except Exception as e:
                        logger.warning(f"Failed to migrate database: {e}", exc_info=True)
                    break


# Global settings instance
settings = Settings()
