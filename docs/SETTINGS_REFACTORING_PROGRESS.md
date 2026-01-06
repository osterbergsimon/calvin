# Settings.vue Refactoring Progress

## Status: ~50% Complete

### ✅ Completed

#### Phase 1: Shared Components
- ✅ `SettingItem.vue` - Reusable setting item wrapper
- ✅ `CollapsibleSection.vue` - Reusable collapsible section
- ✅ `TabNavigation.vue` - Reusable tab navigation
- ✅ `SettingsTab.vue` - Base component for tab content

#### Phase 2: Specialized Components (Partial)
- ✅ `ThemeSelector.vue` - Theme selection grid with previews
- ✅ `PluginInstaller.vue` - Plugin installation (zip/GitHub)

#### Phase 5: Composables
- ✅ `usePlugins.js` - Plugin management logic
- ✅ `useConfigForm.js` - Configuration form management
- ✅ `useSystem.js` - System operations management

#### Phase 6: API Services
- ✅ `pluginsApi.js` - Plugin-related API calls
- ✅ `configApi.js` - Configuration API calls
- ✅ `systemApi.js` - System operations API calls
- ✅ `calendarApi.js` - Calendar API calls

### 🔄 In Progress

#### Phase 2: Specialized Components
- ⏳ `PluginManager.vue` - Plugin cards, instances, configuration
- ⏳ `OrderingManager.vue` - Service/image ordering with drag-and-drop

### 📋 Remaining

#### Phase 3: Category Components
- ⏳ `LayoutCategory.vue` - Layout & Display category
- ⏳ `ContentCategory.vue` - Content category
- ⏳ `PluginsCategory.vue` - Plugins category
- ⏳ `SystemCategory.vue` - System category

#### Phase 4: Tab Components
- ⏳ Layout tabs: Display, UI, Photos, Calendar, Keyboard
- ⏳ Content tabs: Images, Services, Calendar Sources
- ⏳ System tabs: Power, Hardware, Updates, Debug

#### Phase 7: Refactor Main Settings.vue
- ⏳ Replace inline logic with composables
- ⏳ Replace API calls with services
- ⏳ Use new components
- ⏳ Simplify to navigation and routing only

#### Phase 8: Cleanup
- ⏳ Remove duplicate code
- ⏳ Consolidate settings
- ⏳ Remove old code from Settings.vue
- ⏳ Update imports

## Architecture Overview

### Component Structure
```
frontend/src/
├── components/settings/
│   ├── shared/          ✅ Complete
│   │   ├── SettingItem.vue
│   │   ├── CollapsibleSection.vue
│   │   ├── TabNavigation.vue
│   │   └── SettingsTab.vue
│   ├── specialized/     🔄 Partial
│   │   ├── ThemeSelector.vue ✅
│   │   ├── PluginInstaller.vue ✅
│   │   ├── PluginManager.vue ⏳
│   │   └── OrderingManager.vue ⏳
│   ├── categories/      ⏳ Not started
│   └── tabs/            ⏳ Not started
```

### Services Structure
```
frontend/src/services/
├── api.js              ✅ Base API client
├── pluginsApi.js       ✅ Plugin operations
├── configApi.js        ✅ Config operations
├── systemApi.js        ✅ System operations
└── calendarApi.js      ✅ Calendar operations
```

### Composables Structure
```
frontend/src/composables/
├── usePlugins.js       ✅ Plugin management
├── useConfigForm.js    ✅ Config form management
├── useSystem.js        ✅ System operations
└── useTheme.js         ✅ (Already existed)
```

## Usage Examples

### Using Composables
```javascript
import { usePlugins, useConfigForm, useSystem } from '@/composables';

// In component
const { plugins, loadPlugins, installPluginFromZip } = usePlugins();
const { localConfig, updateConfigValue } = useConfigForm();
const { turnDisplayOn, restartBackend } = useSystem();
```

### Using API Services
```javascript
import { getPlugins, installPluginFromZip } from '@/services/pluginsApi';
import { updateConfig } from '@/services/configApi';
import { turnDisplayOn } from '@/services/systemApi';
```

### Using Shared Components
```vue
<template>
  <SettingItem label="Theme" help="Select a theme">
    <ThemeSelector 
      :themes="themes" 
      :selected-theme-id="selectedTheme"
      @select="handleThemeSelect"
    />
  </SettingItem>
  
  <CollapsibleSection title="Display Settings" icon="🖥️">
    <!-- Content -->
  </CollapsibleSection>
  
  <TabNavigation :tabs="tabs" :active-tab="activeTab" @tab-change="handleTabChange" />
</template>
```

## Benefits Achieved

1. **Separation of Concerns**: Logic separated from UI
2. **Reusability**: Components and composables can be used elsewhere
3. **Testability**: Logic can be tested independently
4. **Maintainability**: Smaller, focused files
5. **Consistency**: Shared components ensure consistent UX
6. **Type Safety**: Services provide clear API contracts

## Next Steps

1. **Complete Phase 2**: Extract PluginManager and OrderingManager
2. **Start Phase 3**: Create category components using composables
3. **Create Tab Components**: Extract tab content to separate components
4. **Refactor Settings.vue**: Replace inline code with new components/composables
5. **Cleanup**: Remove old code and consolidate

## Estimated Remaining Work

- Phase 2 completion: 4-6 hours
- Phase 3: 6-8 hours
- Phase 4: 8-12 hours
- Phase 7: 4-6 hours
- Phase 8: 2-4 hours

**Total**: ~24-36 hours remaining

