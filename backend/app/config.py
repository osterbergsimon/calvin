"""Configuration management."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    # Environment
    env: str = "development"
    debug: bool = True

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Database
    database_url: str = "sqlite:///./data/db/calvin.db"

    # Logging
    log_level: str = "INFO"
    log_dir: Path = Path("./logs")

    # Image Storage
    image_dir: Path = Path("./data/images")
    image_cache_dir: Path = Path("./data/cache/images")

    # Photo Frame Mode
    photo_frame_enabled: bool = False
    photo_frame_timeout: int = 300  # seconds (5 minutes default)

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
        # Extract database path and ensure directory exists
        # Handle both absolute paths (sqlite:///path) and relative paths (sqlite:///./path)
        db_path_str = self.database_url.replace("sqlite:///", "")
        # If path starts with /, it's absolute; otherwise resolve relative to current working directory
        db_path = Path(db_path_str) if db_path_str.startswith("/") else Path(db_path_str).resolve()
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
                    print(f"Found database at incorrect location: {wrong_path}")
                    print(f"Migrating to correct location: {db_path}")
                    try:
                        # Ensure target directory exists
                        db_path.parent.mkdir(parents=True, exist_ok=True)
                        # Copy database file
                        import shutil
                        shutil.copy2(wrong_path, db_path)
                        print(f"Database migrated successfully to {db_path}")
                        # Optionally remove old file (commented out for safety)
                        # wrong_path.unlink()
                        # print(f"Removed old database file: {wrong_path}")
                    except Exception as e:
                        print(f"Warning: Failed to migrate database: {e}")
                    break


# Global settings instance
settings = Settings()
