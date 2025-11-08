"""Calendar service for fetching events from external sources."""

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.calendar import CalendarEvent, CalendarSource
from app.models.db_models import CalendarSourceDB
from app.database import AsyncSessionLocal
from app.utils.ical_parser import parse_ical_from_url
from app.utils.google_calendar import normalize_google_calendar_url


class CalendarService:
    """Service for managing calendar events."""

    def __init__(self):
        """Initialize calendar service."""
        self.sources: List[CalendarSource] = []
        self._cache: dict = {}
        self._cache_ttl = timedelta(minutes=5)  # Cache for 5 minutes (reduced for better freshness)
    
    def clear_cache(self):
        """Clear the event cache."""
        self._cache.clear()
        print("Calendar event cache cleared")

    async def get_events(
        self,
        start_date: datetime,
        end_date: datetime,
        source_ids: Optional[List[str]] = None,
    ) -> List[CalendarEvent]:
        """
        Get calendar events for a date range.

        Args:
            start_date: Start date for events (timezone-aware or naive)
            end_date: End date for events (timezone-aware or naive)
            source_ids: Optional list of source IDs to filter by

        Returns:
            List of calendar events (all timezone-aware)
        """
        events: List[CalendarEvent] = []

        # Normalize start_date and end_date to timezone-aware (UTC if naive)
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)

        # Filter sources if specified
        sources = self.sources
        if source_ids:
            sources = [s for s in self.sources if s.id in source_ids]

        # Fetch events from enabled sources
        for source in sources:
            if not source.enabled:
                continue

            if source.type == 'google' and source.ical_url:
                # Normalize URL (convert share URL to iCal if needed)
                ical_url = normalize_google_calendar_url(source.ical_url)
                
                # Check cache first
                cache_key = f"{source.id}:{start_date.isoformat()}:{end_date.isoformat()}"
                if cache_key in self._cache:
                    cached_data = self._cache[cache_key]
                    if datetime.now() - cached_data['timestamp'] < self._cache_ttl:
                        # Ensure cached events have the correct source ID
                        cached_events = cached_data['events']
                        updated_cached_events = []
                        for e in cached_events:
                            # Update source ID if needed
                            if e.source != source.id:
                                updated_event = e.model_copy(update={'source': source.id})
                                updated_cached_events.append(updated_event)
                            else:
                                updated_cached_events.append(e)
                        events.extend(updated_cached_events)
                        continue
                
                    # Fetch from Google Calendar iCal URL (public or private)
                try:
                    print(f"Fetching events from {source.name} using URL: {ical_url[:80]}...")
                    ical_events = await parse_ical_from_url(ical_url)
                    # Filter events by date range and apply calendar source color and ID
                    # Note: Events can span across the date range, so check if event overlaps with range
                    filtered_events = []
                    for e in ical_events:
                        # Event overlaps if: event starts before range ends AND event ends after range starts
                        if e.start <= end_date and e.end >= start_date:
                            # Create a new event with the correct source ID
                            # Use model_copy to create a new instance with updated source
                            updated_event = e.model_copy(update={'source': source.id})
                            # Apply calendar source color if not already set
                            if source.color and not updated_event.color:
                                updated_event.color = source.color
                            filtered_events.append(updated_event)
                    events.extend(filtered_events)
                    print(f"Successfully fetched {len(filtered_events)} events from {source.name}")
                    
                    # Cache the results
                    self._cache[cache_key] = {
                        'events': filtered_events,
                        'timestamp': datetime.now(),
                    }
                except Exception as e:
                    print(f"Error fetching events from {source.name}: {e}")
                    print(f"URL used: {ical_url}")
                    import traceback
                    traceback.print_exc()
                    # Try to use cached data if available
                    if cache_key in self._cache:
                        print(f"Using cached data for {source.name}")
                        cached_events = self._cache[cache_key]['events']
                        # Ensure cached events have the correct source ID
                        updated_cached_events = []
                        for e in cached_events:
                            if e.source != source.id:
                                updated_event = e.model_copy(update={'source': source.id})
                                updated_cached_events.append(updated_event)
                            else:
                                updated_cached_events.append(e)
                        events.extend(updated_cached_events)
            elif source.type == 'proton' and source.ical_url:
                # Proton Calendar uses direct iCal URLs with authentication parameters
                # URL format: https://calendar.proton.me/api/calendar/v1/url/{calendar_id}/calendar.ics?CacheKey=...&PassphraseKey=...
                ical_url = source.ical_url
                
                # Check cache first
                cache_key = f"{source.id}:{start_date.isoformat()}:{end_date.isoformat()}"
                if cache_key in self._cache:
                    cached_data = self._cache[cache_key]
                    if datetime.now() - cached_data['timestamp'] < self._cache_ttl:
                        # Ensure cached events have the correct source ID
                        cached_events = cached_data['events']
                        updated_cached_events = []
                        for e in cached_events:
                            # Update source ID if needed
                            if e.source != source.id:
                                updated_event = e.model_copy(update={'source': source.id})
                                updated_cached_events.append(updated_event)
                            else:
                                updated_cached_events.append(e)
                        events.extend(updated_cached_events)
                        continue
                
                # Fetch from Proton Calendar iCal URL
                try:
                    print(f"Fetching events from {source.name} (Proton Calendar) using URL: {ical_url[:80]}...")
                    ical_events = await parse_ical_from_url(ical_url)
                    # Filter events by date range and apply calendar source color and ID
                    filtered_events = []
                    for e in ical_events:
                        # Event overlaps if: event starts before range ends AND event ends after range starts
                        if e.start <= end_date and e.end >= start_date:
                            # Create a new event with the correct source ID
                            updated_event = e.model_copy(update={'source': source.id})
                            # Apply calendar source color if not already set
                            if source.color and not updated_event.color:
                                updated_event.color = source.color
                            filtered_events.append(updated_event)
                    events.extend(filtered_events)
                    print(f"Successfully fetched {len(filtered_events)} events from {source.name} (Proton Calendar)")
                    
                    # Cache the results
                    self._cache[cache_key] = {
                        'events': filtered_events,
                        'timestamp': datetime.now(),
                    }
                except Exception as e:
                    print(f"Error fetching events from {source.name} (Proton Calendar): {e}")
                    print(f"URL used: {ical_url[:100]}...")
                    import traceback
                    traceback.print_exc()
                    # Try to use cached data if available
                    if cache_key in self._cache:
                        print(f"Using cached data for {source.name} (Proton Calendar)")
                        cached_events = self._cache[cache_key]['events']
                        # Ensure cached events have the correct source ID
                        updated_cached_events = []
                        for e in cached_events:
                            if e.source != source.id:
                                updated_event = e.model_copy(update={'source': source.id})
                                updated_cached_events.append(updated_event)
                            else:
                                updated_cached_events.append(e)
                        events.extend(updated_cached_events)

        # Only add mock events if no real calendar sources are configured or no real events found
        # This helps with initial testing but will be skipped once real calendars are added
        has_enabled_sources = any(source.enabled for source in self.sources)
        has_real_events = len(events) > 0
        
        if not has_enabled_sources or not has_real_events:
            mock_events = self._get_mock_events(start_date, end_date)
            events.extend(mock_events)
            if not has_enabled_sources:
                print(f"Added {len(mock_events)} mock events (no calendar sources configured)")
            else:
                print(f"Added {len(mock_events)} mock events (no real events found from configured calendars)")
        else:
            print(f"Returning {len(events)} real events from configured calendars (mock events skipped)")

        return events

    def _get_mock_events(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> List[CalendarEvent]:
        """
        Generate mock events for testing.

        Args:
            start_date: Start date for events
            end_date: End date for events

        Returns:
            List of mock calendar events
        """
        from datetime import timedelta
        import random

        mock_events: List[CalendarEvent] = []
        colors = ['#2196f3', '#4caf50', '#ff9800', '#f44336', '#9c27b0', '#00bcd4']

        # Normalize dates to timezone-aware (UTC if naive)
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)

        # Generate some events for the current month
        current = start_date
        event_id = 1

        # Add a few events spread throughout the month
        while current <= end_date:
            # 30% chance of an event on any given day
            if random.random() < 0.3:
                # Create 1-3 events per day
                num_events = random.randint(1, 3)
                for i in range(num_events):
                    # Random time during the day
                    hour = random.randint(9, 17)
                    minute = random.choice([0, 15, 30, 45])
                    
                    event_start = datetime(
                        current.year,
                        current.month,
                        current.day,
                        hour,
                        minute,
                        tzinfo=timezone.utc,
                    )
                    
                    # Event duration: 30 minutes to 2 hours
                    duration = random.choice([30, 60, 90, 120])
                    event_end = event_start + timedelta(minutes=duration)

                    # Only add if start is within date range
                    if start_date <= event_start <= end_date:
                        titles = [
                            'Team Meeting',
                            'Doctor Appointment',
                            'Lunch with Friends',
                            'Project Review',
                            'Gym Session',
                            'Dinner Party',
                            'Conference Call',
                            'Birthday Party',
                            'Grocery Shopping',
                            'Movie Night',
                        ]
                        
                        event = CalendarEvent(
                            id=f'mock-{event_id}',
                            title=random.choice(titles),
                            start=event_start,
                            end=event_end,
                            description=f'Mock event for testing',
                            source='mock',
                            color=random.choice(colors),
                            all_day=False,
                        )
                        mock_events.append(event)
                        event_id += 1

            # Move to next day
            current += timedelta(days=1)

        # Add a few all-day events
        all_day_titles = ['Holiday', 'Vacation', 'Conference', 'Workshop']
        num_all_day = min(2, (end_date - start_date).days + 1)  # Don't exceed available days
        for i in range(num_all_day):
            day_offset = random.randint(0, (end_date - start_date).days)
            event_date = start_date + timedelta(days=day_offset)
            
            event = CalendarEvent(
                id=f'mock-all-day-{i}',
                title=random.choice(all_day_titles),
                start=datetime(event_date.year, event_date.month, event_date.day, 0, 0, tzinfo=timezone.utc),
                end=datetime(event_date.year, event_date.month, event_date.day, 23, 59, tzinfo=timezone.utc),
                description='All-day mock event',
                source='mock',
                color=random.choice(colors),
                all_day=True,
            )
            mock_events.append(event)

        return mock_events

    async def load_sources_from_db(self):
        """Load calendar sources from database."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(CalendarSourceDB))
            db_sources = result.scalars().all()
            
            self.sources = [
                CalendarSource(
                    id=db_source.id,
                    type=db_source.type,
                    name=db_source.name,
                    enabled=db_source.enabled,
                    ical_url=db_source.ical_url,
                    api_key=db_source.api_key,
                    color=getattr(db_source, 'color', None),
                    show_time=getattr(db_source, 'show_time', True),
                )
                for db_source in db_sources
            ]
            print(f"Loaded {len(self.sources)} calendar sources from database")

    async def get_sources(self) -> List[CalendarSource]:
        """
        Get all calendar sources.

        Returns:
            List of calendar sources
        """
        return self.sources

    async def add_source(self, source: CalendarSource) -> CalendarSource:
        """
        Add a new calendar source.

        Args:
            source: Calendar source to add

        Returns:
            Added calendar source
        """
        # Save to database
        async with AsyncSessionLocal() as session:
            db_source = CalendarSourceDB(
                id=source.id,
                type=source.type,
                name=source.name,
                enabled=source.enabled,
                ical_url=source.ical_url,
                api_key=source.api_key,
                color=source.color,
                show_time=source.show_time,
            )
            session.add(db_source)
            await session.commit()
            await session.refresh(db_source)
        
        # Add to in-memory list
        self.sources.append(source)
        return source

    async def remove_source(self, source_id: str) -> bool:
        """
        Remove a calendar source.

        Args:
            source_id: ID of source to remove

        Returns:
            True if removed, False if not found
        """
        # Remove from database
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(CalendarSourceDB).where(CalendarSourceDB.id == source_id)
            )
            db_source = result.scalar_one_or_none()
            if db_source:
                await session.delete(db_source)
                await session.commit()
        
        # Remove from in-memory list
        initial_count = len(self.sources)
        self.sources = [s for s in self.sources if s.id != source_id]
        return len(self.sources) < initial_count

    async def update_source(self, source_id: str, source: CalendarSource) -> Optional[CalendarSource]:
        """
        Update a calendar source.

        Args:
            source_id: ID of source to update
            source: Updated calendar source

        Returns:
            Updated calendar source, or None if not found
        """
        # Update in database
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(CalendarSourceDB).where(CalendarSourceDB.id == source_id)
            )
            db_source = result.scalar_one_or_none()
            if db_source:
                db_source.type = source.type
                db_source.name = source.name
                db_source.enabled = source.enabled
                db_source.ical_url = source.ical_url
                db_source.api_key = source.api_key
                db_source.color = source.color
                db_source.show_time = source.show_time
                await session.commit()
                await session.refresh(db_source)
            else:
                return None
        
        # Update in-memory list
        for i, s in enumerate(self.sources):
            if s.id == source_id:
                self.sources[i] = source
                return source
        return None


# Global calendar service instance
calendar_service = CalendarService()

