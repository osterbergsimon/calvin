# Installing Dev Dependencies Later (Optional)

If you need dev dependencies (pytest, ruff, mypy, etc.) for development on the Pi, you can install them later after the dashboard is running.

## Prerequisites

1. **Dashboard must be running** (production dependencies installed)
2. **Swap space active** (2GB recommended)
3. **Stable system** (no recent reboots)

## Install Dev Dependencies

```bash
cd /home/calvin/calvin/backend
export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
export UV_CONCURRENCY=1

# Install dev dependencies
uv sync --extra dev --extra linux
```

## If It Still Reboots

If installing dev dependencies still causes reboots:

1. **Increase swap to 4GB:**
   ```bash
   sudo swapoff /swapfile
   sudo rm -f /swapfile
   sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   free -h
   ```

2. **Install dev packages one at a time:**
   ```bash
   cd /home/calvin/calvin/backend
   export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
   export UV_CONCURRENCY=1
   
   # Install one at a time
   uv pip install pytest
   uv pip install pytest-asyncio
   uv pip install pytest-cov
   uv pip install pytest-mock
   uv pip install ruff
   uv pip install mypy
   uv pip install bandit
   uv pip install pre-commit
   ```

3. **Or skip dev dependencies entirely:**
   - Dev dependencies are only needed for running tests and linting
   - The dashboard works fine without them
   - You can develop on your main machine and deploy to Pi

## Why Skip Dev Dependencies?

- **Pi 3B+ has only 1GB RAM**
- Dev dependencies add significant memory pressure during installation
- They're not needed for production dashboard operation
- You can develop and test on your main machine instead


