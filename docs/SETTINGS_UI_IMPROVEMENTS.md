# Settings UI Improvements: Plugin Instance Management

## Current State Analysis

### Current Architecture
1. **Plugins Section**: Shows plugin types (iframe, mealie, weather, etc.) with enable/disable toggles
2. **Web Services Section**: Contains a form to add web services, which creates iframe plugin instances
3. **Problem**: Plugin instances are created through "Web Services" section, mixing concepts and making it unclear that:
   - Multiple instances of the same plugin type are possible
   - Other plugin types (like mealie, weather) are also "web services"
   - Plugin instances are the actual entities being managed

### Current Flow
- User goes to "Web Services" → Adds a service → Creates an iframe plugin instance
- The instance appears in the "Web Services" list
- Plugin types are managed separately in "Plugins" section
- No clear way to see all instances of a plugin type together

## Proposed Solutions

### Option 1: Unified Plugin Instance Management (Recommended)

**Concept**: Move all plugin instance management into the Plugins section, with clear instance management UI.

#### Structure:
```
Plugins Section
├── Plugin Type: Iframe Service
│   ├── Enable/Disable Toggle (for plugin type)
│   ├── Common Settings (if any)
│   └── Instances
│       ├── [Add Instance] button
│       ├── Instance 1: "Shopping List" (enabled, running)
│       ├── Instance 2: "Weather Dashboard" (enabled, running)
│       └── Instance 3: "News Feed" (disabled)
│
├── Plugin Type: Mealie
│   ├── Enable/Disable Toggle
│   ├── Common Settings
│   └── Instances
│       └── [Add Instance] button
│
└── Plugin Type: Weather (YR)
    ├── Enable/Disable Toggle
    └── Instances
        └── [Add Instance] button
```

#### Benefits:
- Clear separation: Plugin types vs. instances
- Easy to see all instances of a plugin type
- Supports multiple instances naturally
- Unified management interface
- All plugin settings in one place (no separate "Web Services" section)
- Settings are contextual: instance-level or plugin type-level based on what makes sense

#### Implementation:
1. Expand Plugins section to show instances for each plugin type
2. Add "Add Instance" button for each plugin type
3. Show instance list with individual enable/disable, edit, delete
4. Remove "Web Services" section entirely
5. Move all plugin-related settings (e.g., meal plan card size) to appropriate plugin/instance config:
   - Instance-level settings: Per-instance display preferences (card size, display order, fullscreen)
   - Plugin type-level settings: Common settings that apply to all instances of a type

---

### Option 2: Separate "Plugin Instances" Section

**Concept**: Create a dedicated "Plugin Instances" section separate from both "Plugins" and "Web Services".

#### Structure:
```
Settings
├── Plugins Section (Plugin Types)
│   └── Enable/disable plugin types only
│
├── Plugin Instances Section (NEW)
│   ├── Filter by plugin type
│   ├── [Add Instance] button (opens modal with plugin type selector)
│   └── List of all instances
│       ├── Instance: "Shopping List" (iframe) [enabled] [edit] [delete]
│       ├── Instance: "Mealie" (mealie) [enabled] [edit] [delete]
│       └── Instance: "Weather" (yr_weather) [enabled] [edit] [delete]
│
└── (Web Services section removed - all settings moved to plugins)
```

#### Benefits:
- Clear separation of concerns
- Easy to see all instances in one place
- Can filter by plugin type
- Plugin types and instances are separate concepts

#### Drawbacks:
- Adds another section to navigate
- May be less intuitive for users who think of instances as part of plugin types

---

### Option 3: Hybrid Approach - Instances in Plugin Cards

**Concept**: Keep plugin types in Plugins section, but show instances within each plugin card.

#### Structure:
```
Plugins Section
├── Plugin Card: Iframe Service
│   ├── Enable/Disable Toggle
│   ├── Common Settings (collapsible)
│   └── Instances (collapsible)
│       ├── [Add Instance] button
│       ├── Instance 1: "Shopping List" [enabled] [edit] [delete]
│       └── Instance 2: "Weather Dashboard" [enabled] [edit] [delete]
│
└── Plugin Card: Mealie
    ├── Enable/Disable Toggle
    └── Instances
        └── [Add Instance] button
```

#### Benefits:
- Instances are clearly associated with their plugin type
- Supports multiple instances
- Keeps related functionality together
- Less navigation needed

---

### Option 4: Tab-Based Interface

**Concept**: Use tabs to separate plugin types from instances.

#### Structure:
```
Plugins Section
├── Tabs: [Plugin Types] [Instances]
│
├── Plugin Types Tab
│   └── List of plugin types with enable/disable
│
└── Instances Tab
    ├── Grouped by plugin type
    ├── [Add Instance] button
    └── List of all instances with actions
```

#### Benefits:
- Clear separation
- Can see all instances at once
- Easy to switch between views

#### Drawbacks:
- May require more clicks to manage instances
- Less intuitive than showing instances with their types

---

## Recommended Approach: Option 1 (Unified Plugin Instance Management)

### Detailed UI Design

#### Plugin Card Structure:
```
┌─────────────────────────────────────────────────────────┐
│ Iframe Service                    [Enable/Disable] ⚙️  │
│ Display external websites in an iframe                  │
│                                                          │
│ ▼ Instances (3)                                         │
│   ┌───────────────────────────────────────────────────┐ │
│   │ Shopping List                    [●] [enabled]   │ │
│   │ https://shopping.example.com                      │ │
│   │ [Edit] [Delete]                                   │ │
│   └───────────────────────────────────────────────────┘ │
│   ┌───────────────────────────────────────────────────┐ │
│   │ Weather Dashboard                 [●] [enabled]   │ │
│   │ https://weather.example.com                       │ │
│   │ [Edit] [Delete]                                   │ │
│   └───────────────────────────────────────────────────┘ │
│   ┌───────────────────────────────────────────────────┐ │
│   │ News Feed                        [○] [disabled]   │ │
│   │ https://news.example.com                          │ │
│   │ [Edit] [Delete]                                   │ │
│   └───────────────────────────────────────────────────┘ │
│                                                          │
│   [+ Add Instance]                                       │
└─────────────────────────────────────────────────────────┘
```

#### Add Instance Flow:
1. Click "[+ Add Instance]" button
2. Modal/form appears with fields from plugin's instance config schema
3. For iframe: Name, URL, Fullscreen preference
4. For other plugins: Their specific config fields
5. Save creates the instance

#### Instance Management:
- Each instance shows: name, key details (URL for iframe), status, actions
- Enable/disable toggle per instance
- Edit button opens instance config
- Delete button with confirmation
- Running status indicator (if applicable)

### Implementation Steps

1. **Update Plugins Section UI**
   - Add "Instances" subsection to each plugin card
   - Show instance list with individual controls
   - Add "Add Instance" button

2. **Create Instance Management Functions**
   - `addPluginInstance(pluginTypeId, config)` - Create new instance
   - `updatePluginInstance(instanceId, config)` - Update instance
   - `deletePluginInstance(instanceId)` - Delete instance
   - `togglePluginInstance(instanceId, enabled)` - Enable/disable

3. **Remove Web Services Section**
   - Remove entire "Web Services" section
   - Move meal plan card size setting to Mealie plugin instance config (instance-level setting)
   - Move any other plugin-specific settings to appropriate plugin/instance configs

4. **Backend API Considerations**
   - Ensure `/api/plugins/{type_id}/instances` endpoints support:
     - POST to create instance
     - PUT to update instance
     - DELETE to remove instance
   - Instance config should be plugin-specific

5. **Migration Path**
   - Existing web services (iframe instances) should appear in Plugins section
   - No data migration needed, just UI reorganization

### Benefits of This Approach

1. **Clear Mental Model**: Plugin types → Instances
2. **Multiple Instances**: Naturally supports multiple iframes or other plugin instances
3. **Unified Interface**: All plugin management in one place
4. **Scalable**: Easy to add new plugin types with instance support
5. **Intuitive**: Users understand "I have 3 iframe services" vs "I have web services"

### Edge Cases to Consider

1. **Plugin Types Without Instances**: Some plugins may not support multiple instances
   - Solution: Hide "Instances" section or show "Single instance only" message

2. **Instance-Specific vs Common Settings**: 
   - Common settings apply to plugin type
   - Instance settings apply to individual instances
   - Solution: Clear visual separation in UI

3. **Backward Compatibility**: Existing "web services" need to appear as iframe instances
   - Solution: Load existing iframe plugin instances in Plugins section

---

## Alternative: Quick Win Approach

If full refactoring is too much, a quick improvement would be:

1. **Rename "Web Services" to "Service Instances"**
2. **Add plugin type badge to each service** (e.g., "iframe", "mealie")
3. **Add filter/group by plugin type**
4. **Add note in Plugins section**: "Manage instances in Service Instances section"

This provides clarity without major refactoring.

---

## Settings Migration

### Meal Plan Card Size
- **Current**: Global config setting (`mealPlanCardSize`)
- **New**: Mealie plugin instance-level setting
- **Rationale**: Each Mealie instance can have different display preferences
- **Implementation**: Add `meal_plan_card_size` to Mealie instance config schema

### Other Settings
- All plugin-related settings should be moved to appropriate plugin/instance configs
- Instance-level: Display preferences, ordering, per-instance behavior
- Plugin type-level: Common settings that apply to all instances

## Questions to Consider

1. Should instances be editable inline or via modal?
2. Should we support bulk operations (enable/disable multiple instances)?
3. How should we handle plugin types that don't support multiple instances?
4. Should instance creation be wizard-based or single form?

---

## Next Steps

1. Review and select preferred approach
2. Create detailed mockups/wireframes
3. Implement selected approach
4. Update documentation
5. Gather user feedback

