# Debug Backend Service

If the backend service is running but not responding, check these:

## Check Service Logs

```bash
# View recent logs
sudo journalctl -u calvin-backend -n 50

# Follow logs in real-time
sudo journalctl -u calvin-backend -f
```

## Check if Backend Process is Running

```bash
# Check for uvicorn process
ps aux | grep uvicorn

# Check if port 8000 is in use
sudo netstat -tlnp | grep 8000
# Or
sudo ss -tlnp | grep 8000
```

## Test Backend Manually

```bash
cd /home/calvin/calvin/backend

# If using pip (venv exists)
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000

# If using UV
export PATH="/home/calvin/.local/bin:/home/calvin/.cargo/bin:$PATH"
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Common Issues

### 1. Import Errors
```bash
# Check if dependencies are installed
cd /home/calvin/calvin/backend
source .venv/bin/activate
python -c "import app.main"
```

### 2. Permission Issues
```bash
# Check ownership
ls -la /home/calvin/calvin/backend/.venv
ls -la /home/calvin/calvin/backend/data
```

### 3. Missing Dependencies
```bash
# Reinstall dependencies
cd /home/calvin/calvin/backend
source .venv/bin/activate
pip install -r requirements.txt  # if exists
# Or reinstall manually
pip install fastapi uvicorn[standard] python-dotenv
```

### 4. Database/Data Directory Issues
```bash
# Check data directories exist
ls -la /home/calvin/calvin/backend/data
mkdir -p /home/calvin/calvin/backend/data/db
mkdir -p /home/calvin/calvin/backend/data/images
sudo chown -R calvin:calvin /home/calvin/calvin/backend/data
```


