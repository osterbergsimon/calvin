# Event Component Refactoring Analysis

## Current State

### Event Rendering in CalendarView.vue
- Events are rendered inline with complex conditional logic
- ~35 lines of template code for event rendering
- Multiple helper functions scattered throughout the component:
  - `getEventColor()`
  - `getEventTitle()`
  - `getEventDisplayText()`
  - `truncateEventTitle()`
  - `formatEventTime()`
- Complex class bindings based on event metadata (`_isStart`, `_isEnd`, `_isMiddle`, `_isMultiDay`)
- Conditional rendering for single-day vs multi-day events
- Event-specific styling spread across multiple CSS classes

### Event Types
1. **Single-day events**: Full text display
2. **Multi-day start**: Full text + rounded left corners + right border
3. **Multi-day middle**: Continuation arrow + truncated title + side borders
4. **Multi-day end**: Full text + rounded right corners + left border

## Proposed Refactoring

### New Component: `CalendarEventItem.vue`

#### Props
```typescript
{
  event: Event,           // The event object with metadata
  dayIndex: number,       // For focus management
  eventIndex: number,     // For focus management
  dayDate: Date,          // The date this event appears on
  isFocused: boolean,     // Whether this event is focused
  isSelected: boolean,    // Whether this event is selected
}
```

#### Emits
```typescript
{
  'click': (event: Event, dayDate: Date) => void,
  'focus': (dayIndex: number, eventIndex: number) => void,
  'keydown': (event: KeyboardEvent) => void,
}
```

#### Internal Logic
- Compute event color (from event.color or calendar source)
- Determine event type (start/end/middle/single)
- Format display text based on event type
- Handle continuation text truncation
- Apply appropriate CSS classes based on event type

#### Benefits

1. **Separation of Concerns**
   - CalendarView focuses on grid layout and day management
   - EventItem handles all event-specific rendering logic
   - Clearer component boundaries

2. **Reusability**
   - Same component for all event types (single-day and multi-day)
   - Consistent behavior across all event instances
   - Easier to maintain and test

3. **Maintainability**
   - All event styling in one place
   - Event logic encapsulated
   - Easier to add new event features
   - Reduced complexity in CalendarView

4. **Uniform Scaling**
   - Single component means consistent scaling rules
   - No need to duplicate responsive styles
   - Easier to ensure all event types scale uniformly

5. **Testability**
   - Can unit test event rendering independently
   - Easier to test different event types
   - Mock props for different scenarios

#### Implementation Considerations

1. **Helper Functions**
   - Move event-related helpers to the component or a composable
   - `useEventHelpers()` composable could provide:
     - `getEventColor()`
     - `getEventDisplayText()`
     - `formatEventTime()`
     - `truncateEventTitle()`

2. **Styling**
   - Move all `.event-item*` styles to component
   - Use scoped styles
   - Keep responsive breakpoints in component

3. **Focus Management**
   - Component handles its own focus state
   - Emits focus events to parent
   - Parent manages which event is focused

4. **Event Metadata**
   - Event object already contains `_isStart`, `_isEnd`, `_isMiddle`, `_isMultiDay`
   - Component uses these flags for conditional rendering
   - No need to recalculate in component

#### Migration Path

1. Create `CalendarEventItem.vue` component
2. Move event rendering logic to component
3. Move event helper functions to composable or component
4. Move event styles to component
5. Update CalendarView to use new component
6. Test all event types and responsive breakpoints
7. Remove old event rendering code from CalendarView

#### Potential Challenges

1. **Ref Management**
   - Currently uses `setEventRef()` for keyboard navigation
   - Need to expose ref from component or use different approach
   - Could use template refs with component refs

2. **Event Color Calculation**
   - Requires access to `calendarStore.sources`
   - Component needs access to store or receive color as prop
   - Prefer passing color as prop for better encapsulation

3. **Time Format**
   - Requires access to `configStore.timeFormat`
   - Could pass as prop or access store in component
   - Prop is cleaner but adds prop surface

4. **Responsive Styles**
   - Need to ensure all breakpoints work
   - May need to duplicate some responsive rules
   - Or use CSS custom properties for scaling

## Recommendation

**YES - Refactor into component**

The benefits significantly outweigh the challenges:
- Much cleaner CalendarView component
- Better encapsulation and maintainability
- Easier to ensure uniform scaling
- More testable code
- Consistent with existing component structure (EventDetailPanel)

The challenges are manageable:
- Ref management can use Vue 3 template refs
- Event color can be computed in CalendarView and passed as prop
- Time format can be passed as prop or accessed from store
- Responsive styles work the same in scoped component styles

## Next Steps

1. Create `CalendarEventItem.vue` component
2. Create `useEventHelpers.js` composable (optional, for shared logic)
3. Migrate event rendering logic
4. Test thoroughly with all event types
5. Update CalendarView to use new component

