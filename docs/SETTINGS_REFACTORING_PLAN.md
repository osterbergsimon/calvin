# Settings.vue Refactoring Plan

## Current State Analysis

### File Size & Structure
- **Current size**: 8,480 lines in a single file
- **Main categories**: 3 (Layout & Display, Content, System)
- **Sections**: ~15+ collapsible sections
- **Key issue**: Massive monolithic component with poor separation of concerns

### Current Categories & Sections

#### Layout & Display (`layout`)
1. Display Settings (orientation, calendar split, side view position, theme selection)
2. UI Settings (minimal UI, clock format, date format, etc.)
3. Photos Settings (photo sources, refresh interval)
4. Photo Frame Mode Settings
5. Keyboard Settings (mappings)
6. Calendar Settings (sources, ordering)
7. Service Ordering
8. Image Ordering
9. Plugins (with tabbed interface for types: calendar, image, service, theme)

#### Content (`content`)
- Duplicate sections from layout category (appears twice in code)

#### System (`system`)
1. Display Power Settings (schedule, timeout, manual control)
2. Reboot Combo Settings
3. Debug & Logging
4. Dashboard Refresh Settings
5. System Information & Update Settings

### Issues Identified

1. **Duplication**: Content category appears to duplicate layout sections
2. **No tabbed interface**: Only plugins section has tabs; other sections use collapsible headers
3. **Poor organization**: Related settings scattered across sections
4. **Monolithic component**: All logic in one massive file
5. **Inconsistent UX**: Mix of collapsible sections and tabs

## Proposed UX Improvements

### 1. Tabbed Interface for All Categories
Apply the successful plugins tab pattern to all categories:

- **Layout & Display**: Tabs for Display, UI, Photos, Calendar, Keyboard
- **Content**: Tabs for Images, Services, Calendar Sources
- **System**: Tabs for Power, Hardware, Updates, Debug

### 2. Better Organization
Group related settings logically:
- **Display**: All display-related settings (orientation, power, schedule)
- **UI**: All UI customization (theme, clock, date, minimal UI)
- **Content**: All content sources (images, services, calendar)
- **Plugins**: Keep existing tabbed structure (it works well!)
- **System**: Hardware, updates, debugging

### 3. Eliminate Duplication
- Remove duplicate content category sections
- Consolidate theme selection (currently in Display Settings)
- Unify ordering settings (service/image ordering)

## Component Structure Plan

### Main Component: `Settings.vue`
**Purpose**: Main container with sidebar navigation and category routing
**Size**: ~200-300 lines
**Responsibilities**:
- Category navigation sidebar
- Category routing
- System menu (restart, reload)
- Header with back button

### Category Components

#### `LayoutCategory.vue`
**Tabs**:
1. **Display** (`DisplayTab.vue`)
   - Screen orientation
   - Calendar split
   - Side view position
   - Display power schedule
   - Display timeout
   - Manual display control

2. **UI** (`UITab.vue`)
   - Theme selection
   - Minimal UI toggle
   - Clock format
   - Date format
   - Weekend highlighting
   - Other UI preferences

3. **Photos** (`PhotosTab.vue`)
   - Photo sources
   - Refresh interval
   - Photo frame mode

4. **Calendar** (`CalendarTab.vue`)
   - Calendar sources
   - Source ordering
   - Calendar-specific settings

5. **Keyboard** (`KeyboardTab.vue`)
   - Keyboard mappings
   - Key combinations

#### `ContentCategory.vue`
**Tabs**:
1. **Images** (`ImagesTab.vue`)
   - Image sources
   - Image ordering
   - Image plugin management

2. **Services** (`ServicesTab.vue`)
   - Service plugins
   - Service ordering
   - Service configuration

3. **Calendar Sources** (`CalendarSourcesTab.vue`)
   - Calendar plugin instances
   - Source configuration

#### `PluginsCategory.vue`
**Keep existing structure** (it works well!):
- Install section (Zip/GitHub tabs)
- Plugin type tabs (Calendar, Image, Service, Theme)
- Plugin cards with instances

#### `SystemCategory.vue`
**Tabs**:
1. **Power** (`PowerTab.vue`)
   - Display power schedule (move from Layout)
   - Display timeout
   - Manual display control
   - Reboot combo settings

2. **Hardware** (`HardwareTab.vue`)
   - System information
   - Hardware status

3. **Updates** (`UpdatesTab.vue`)
   - Update settings
   - Branch selection
   - Update status

4. **Debug** (`DebugTab.vue`)
   - Console logging
   - Log levels
   - Dashboard refresh settings

### Shared Components

#### `SettingsTab.vue`
**Purpose**: Base component for all tab content
**Features**:
- Consistent styling
- Collapsible sections support
- Help text formatting

#### `SettingItem.vue`
**Purpose**: Reusable setting item wrapper
**Props**:
- `label`: Setting label
- `help`: Help text
- `required`: Whether setting is required
**Slots**:
- `default`: Setting input/control

#### `CollapsibleSection.vue`
**Purpose**: Reusable collapsible section
**Props**:
- `title`: Section title
- `expanded`: Initial expanded state
- `icon`: Optional icon

#### `TabNavigation.vue`
**Purpose**: Reusable tab navigation component
**Props**:
- `tabs`: Array of tab definitions
- `activeTab`: Active tab ID
**Events**:
- `tab-change`: Emitted when tab changes

### Specialized Components

#### `ThemeSelector.vue`
**Purpose**: Extract theme selection from Display settings
**Features**:
- Theme grid display
- Preview images
- Built-in vs custom themes

#### `PluginInstaller.vue`
**Purpose**: Extract plugin installation UI
**Features**:
- Zip file upload
- GitHub repository browser
- Installation status

#### `PluginManager.vue`
**Purpose**: Extract plugin management UI
**Features**:
- Plugin type tabs
- Plugin cards
- Instance management

#### `OrderingManager.vue`
**Purpose**: Unified ordering component for services/images
**Features**:
- Drag-and-drop ordering
- Order input fields
- Tree view for nested items

## File Structure

```
frontend/src/
├── views/
│   └── Settings.vue (main container, ~300 lines)
├── components/
│   └── settings/
│       ├── categories/
│       │   ├── LayoutCategory.vue
│       │   ├── ContentCategory.vue
│       │   ├── PluginsCategory.vue
│       │   └── SystemCategory.vue
│       ├── tabs/
│       │   ├── layout/
│       │   │   ├── DisplayTab.vue
│       │   │   ├── UITab.vue
│       │   │   ├── PhotosTab.vue
│       │   │   ├── CalendarTab.vue
│       │   │   └── KeyboardTab.vue
│       │   ├── content/
│       │   │   ├── ImagesTab.vue
│       │   │   ├── ServicesTab.vue
│       │   │   └── CalendarSourcesTab.vue
│       │   └── system/
│       │       ├── PowerTab.vue
│       │       ├── HardwareTab.vue
│       │       ├── UpdatesTab.vue
│       │       └── DebugTab.vue
│       ├── shared/
│       │   ├── SettingsTab.vue
│       │   ├── SettingItem.vue
│       │   ├── CollapsibleSection.vue
│       │   └── TabNavigation.vue
│       └── specialized/
│           ├── ThemeSelector.vue
│           ├── PluginInstaller.vue
│           ├── PluginManager.vue
│           └── OrderingManager.vue
```

## Migration Strategy

### Phase 1: Extract Shared Components
1. Create `SettingItem.vue`
2. Create `CollapsibleSection.vue`
3. Create `TabNavigation.vue`
4. Create `SettingsTab.vue` base component

### Phase 2: Extract Specialized Components
1. Extract `ThemeSelector.vue` from Display settings
2. Extract `PluginInstaller.vue` from Plugins section
3. Extract `PluginManager.vue` from Plugins section
4. Extract `OrderingManager.vue` for service/image ordering

### Phase 3: Create Category Components
1. Create `SystemCategory.vue` (simplest, start here)
2. Create `LayoutCategory.vue`
3. Create `ContentCategory.vue`
4. Refactor `PluginsCategory.vue` (extract from main file)

### Phase 4: Create Tab Components
1. Create all tab components for each category
2. Move settings logic to appropriate tabs
3. Update category components to use tabs

### Phase 5: Refactor Main Settings.vue
1. Simplify to just navigation and routing
2. Remove all section logic
3. Import and use category components

### Phase 6: Cleanup & Polish
1. Remove duplicate code
2. Consolidate settings (theme, ordering, etc.)
3. Improve UX consistency
4. Add loading states
5. Add error handling

## Settings Consolidation

### Theme Selection
**Current**: In Display Settings (Layout category)
**Proposed**: Move to UI Tab (Layout category)
**Rationale**: Theme is a UI customization, not a display hardware setting

### Display Power
**Current**: In System category
**Proposed**: Move to Display Tab (Layout category)
**Rationale**: Display power is directly related to display hardware

### Service/Image Ordering
**Current**: Separate sections in Layout category
**Proposed**: Unified in Content category tabs
**Rationale**: Ordering is about content organization, not layout

### Calendar Sources
**Current**: In Layout category
**Proposed**: Move to Content category
**Rationale**: Calendar sources are content, not layout

## UX Improvements

### 1. Consistent Tab Interface
- All categories use tabs for navigation
- Tabs are always visible (not collapsible)
- Active tab clearly highlighted
- Smooth transitions between tabs

### 2. Better Visual Hierarchy
- Clear category → tab → section hierarchy
- Consistent spacing and styling
- Icons for categories and tabs
- Breadcrumb navigation

### 3. Improved Settings Organization
- Related settings grouped together
- Logical flow within tabs
- Clear section headers
- Help text always visible or easily accessible

### 4. Better Feedback
- Loading states for async operations
- Success/error messages
- Validation feedback
- Save indicators

### 5. Responsive Design
- Mobile-friendly tab navigation
- Collapsible sidebar on small screens
- Touch-friendly controls
- Optimized for tablet use

## Benefits

1. **Maintainability**: Smaller, focused components
2. **Reusability**: Shared components can be used elsewhere
3. **Testability**: Easier to test individual components
4. **Performance**: Better code splitting and lazy loading
5. **UX**: Consistent, intuitive interface
6. **Developer Experience**: Easier to find and modify settings

## Estimated Impact

- **File size reduction**: From 8,480 lines to ~300 lines in main file
- **Component count**: ~25-30 focused components
- **Average component size**: 100-300 lines each
- **Code duplication**: Eliminated
- **UX consistency**: Significantly improved

