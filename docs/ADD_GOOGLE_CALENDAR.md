# Adding a Google Calendar Share Link

## How to Add Your Calendar

### Step 1: Get Your Google Calendar Share URL

Your share URL looks like:
```
https://calendar.google.com/calendar/u/0?cid=ZDRkMGU2MzlmMTU0YjFjZmExZmNmZjAxZTU5M2QwN2IwY2JjNmZkOGMwOGY3MTA0NDdiMmY3NzhlZjYxYjZkNUBncm91cC5jYWxlbmRhci5nb29nbGUuY29t
```

### Step 2: Add Calendar via API

Use the API to add your calendar:

**Using curl:**
```bash
curl -X POST http://localhost:8000/api/calendar/sources \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-calendar",
    "type": "google",
    "name": "My Calendar",
    "ical_url": "https://calendar.google.com/calendar/u/0?cid=ZDRkMGU2MzlmMTU0YjFjZmExZmNmZjAxZTU5M2QwN2IwY2JjNmZkOGMwOGY3MTA0NDdiMmY3NzhlZjYxYjZkNUBncm91cC5jYWxlbmRhci5nb29nbGUuY29t",
    "enabled": true
  }'
```

**Using the API docs:**
1. Visit http://localhost:8000/docs
2. Find `POST /api/calendar/sources`
3. Click "Try it out"
4. Enter your calendar data:
   ```json
   {
     "id": "my-calendar",
     "type": "google",
     "name": "My Calendar",
     "ical_url": "https://calendar.google.com/calendar/u/0?cid=ZDRkMGU2MzlmMTU0YjFjZmExZmNmZjAxZTU5M2QwN2IwY2JjNmZkOGMwOGY3MTA0NDdiMmY3NzhlZjYxYjZkNUBncm91cC5jYWxlbmRhci5nb29nbGUuY29t",
     "enabled": true
   }
   ```
5. Click "Execute"

### Step 3: Verify Calendar is Added

Check your calendars:
```bash
curl http://localhost:8000/api/calendar/sources
```

### Step 4: View Events

Events will automatically appear in the calendar view. The system will:
- Convert your share URL to iCal format automatically
- Fetch events every 15 minutes (automatic refresh)
- Cache events for 15 minutes to reduce API calls
- Display events in the monthly calendar view

## Automatic Updates

The calendar service automatically:
- **Refreshes every 15 minutes** - Events are fetched from Google Calendar
- **Caches results** - Reduces API calls and improves performance
- **Handles errors gracefully** - Falls back to cached data if fetch fails

## Calendar URL Conversion

The system automatically converts:
- **Share URL**: `https://calendar.google.com/calendar/u/0?cid=...`
- **To iCal URL**: `https://calendar.google.com/calendar/ical/.../basic.ics`

You can use either format - the system will normalize it automatically.

## Troubleshooting

### Calendar not showing events
1. Make sure the calendar is **public** or **shared** in Google Calendar
2. Check that the `ical_url` is correct
3. Verify the calendar source is enabled: `"enabled": true`
4. Check backend logs for errors

### Events not updating
- Events refresh every 15 minutes automatically
- You can force a refresh by restarting the backend
- Check the cache TTL (15 minutes by default)

