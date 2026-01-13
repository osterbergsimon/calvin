# Remote Settings Configuration

## Problem

By default, when you edit settings on your development machine, the frontend connects to your local backend (`localhost:8000`), which saves settings to your local database. The remote dashboard machine has its own separate backend and database, so changes made on your dev machine don't appear on the remote dashboard.

## Solution

Configure the frontend on your development machine to connect to the remote dashboard's backend API instead of the local one.

## Configuration Steps

### Option 1: Environment Variable (Recommended)

1. **Create a `.env` file** in the `frontend/` directory:

```bash
cd frontend
cp .env.example .env
```

2. **Edit `.env`** and set the remote dashboard's API URL:

```env
# Replace with your remote dashboard's IP address or hostname
VITE_API_URL=http://192.168.1.100:8000/api
```

Replace `192.168.1.100` with your remote dashboard's IP address or hostname.

3. **Restart the frontend development server**:

```bash
# Stop the current server (Ctrl+C), then restart
npm run dev
```

### Option 2: Command Line Environment Variable

Set the environment variable when starting the dev server:

**Windows (PowerShell):**
```powershell
$env:VITE_API_URL="http://192.168.1.100:8000/api"; npm run dev
```

**Windows (CMD):**
```cmd
set VITE_API_URL=http://192.168.1.100:8000/api && npm run dev
```

**Linux/Mac:**
```bash
VITE_API_URL=http://192.168.1.100:8000/api npm run dev
```

### Option 3: Build with Remote API

If you're building the frontend for production:

```bash
VITE_API_URL=http://192.168.1.100:8000/api npm run build
```

## Finding Your Remote Dashboard's IP Address

### On the Remote Dashboard (Raspberry Pi):

```bash
# Get IP address
hostname -I

# Or
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### From Your Development Machine:

1. **Check your router's admin panel** for connected devices
2. **Use network scanning tools** like `nmap`:
   ```bash
   nmap -sn 192.168.1.0/24
   ```
3. **Check the dashboard's display** - some setups show the IP on startup

## Verifying the Connection

1. **Start the frontend** with the remote API URL configured
2. **Open the browser console** (F12)
3. **Check network requests** - API calls should go to your remote dashboard's IP
4. **Make a settings change** and verify it appears on the remote dashboard

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console, you need to allow your dev machine's IP in the backend CORS settings.

**Edit `backend/app/main.py`** and add your dev machine's IP to the allowed origins:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8000",
        "http://192.168.1.50:5173",  # Add your dev machine's IP
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Or, for development, you can allow all origins (not recommended for production):

```python
allow_origins=["*"],
```

### Connection Refused

- **Check the remote backend is running**: `curl http://192.168.1.100:8000/api/health`
- **Check firewall settings** on the remote machine
- **Verify the IP address** is correct
- **Check the port** (default is 8000)

### Settings Still Not Syncing

- **Verify the API URL** is correct in your `.env` file
- **Restart the frontend dev server** after changing `.env`
- **Check browser console** for API errors
- **Verify you're editing settings** on the correct frontend instance

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐
│  Dev Machine    │         │ Remote Dashboard  │
│                 │         │   (Raspberry Pi)  │
│  Frontend       │────────▶│   Backend API     │
│  (Browser)      │         │   (Port 8000)     │
│                 │         │                   │
│  Local Backend  │         │   SQLite DB       │
│  (Not Used)     │         │   (calvin.db)     │
└─────────────────┘         └──────────────────┘
```

When configured correctly:
- Frontend on dev machine → connects to → Remote backend API
- Settings saved → stored in → Remote database
- Changes appear → on → Remote dashboard display

## Switching Back to Local Development

To switch back to local development:

1. **Remove or comment out** `VITE_API_URL` in `.env`:
   ```env
   # VITE_API_URL=http://192.168.1.100:8000/api
   ```

2. **Or set it to local**:
   ```env
   VITE_API_URL=http://localhost:8000/api
   ```

3. **Restart the frontend dev server**


