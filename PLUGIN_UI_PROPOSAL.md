# Plugin UI System Proposal

## Current State

The current system uses a basic schema-based approach where plugins define `common_config_schema` with field types (`string`, `password`). The frontend renders these generically, but has hardcoded special cases:
- Browse button for local images plugin
- Help text for Unsplash plugin
- Special handling for IMAP plugin

This requires frontend code changes for each new plugin feature.

## Proposed Solution: Extended UI Schema Protocol

### Option 1: Extended Schema Protocol (Recommended)

Extend the `common_config_schema` to support rich UI definitions:

```python
{
    "api_key": {
        "type": "password",
        "description": "Unsplash API key",
        "default": "",
        "ui": {
            "component": "input",  # input, textarea, select, file, directory
            "placeholder": "Enter your API key",
            "help_text": "Get your free API key at https://unsplash.com/developers",
            "help_link": "https://unsplash.com/developers",
            "validation": {
                "required": True,
                "pattern": "^[a-zA-Z0-9_-]+$"
            },
            "actions": [  # Custom buttons/actions
                {
                    "type": "button",
                    "label": "Get API Key",
                    "action": "open_url",
                    "url": "https://unsplash.com/developers"
                }
            ]
        }
    },
    "image_dir": {
        "type": "string",
        "description": "Image directory",
        "default": "",
        "ui": {
            "component": "directory",  # Special component type
            "browse_button": True,
            "placeholder": "Select directory..."
        }
    },
    "category": {
        "type": "string",
        "description": "Photo category",
        "default": "popular",
        "ui": {
            "component": "select",
            "options": [
                {"value": "popular", "label": "Popular"},
                {"value": "latest", "label": "Latest"},
                {"value": "oldest", "label": "Oldest"}
            ]
        }
    }
}
```

### Option 2: Plugin-Provided Vue Components

Allow plugins to provide Vue components that get dynamically loaded:

```python
{
    "type_id": "imap",
    "plugin_type": PluginType.IMAGE,
    "name": "Email (IMAP)",
    "ui_component": "ImapSettings.vue",  # Path to component
    "ui_component_url": "/api/plugins/imap/ui",  # Or URL to fetch component
}
```

**Pros:**
- Maximum flexibility
- Plugins can have completely custom UI

**Cons:**
- Requires dynamic component loading
- Security concerns (code injection)
- More complex build process

### Option 3: Hybrid Approach (Best of Both Worlds)

Support both schema-based and component-based UI:

```python
{
    "type_id": "imap",
    "plugin_type": PluginType.IMAGE,
    "name": "Email (IMAP)",
    "common_config_schema": {
        # Standard fields use schema
        "email_address": {...},
        "email_password": {...}
    },
    "ui_mode": "schema",  # or "component" or "hybrid"
    "ui_component": "ImapSettings.vue",  # Optional: custom component
    "ui_sections": [  # Optional: custom sections
        {
            "id": "test_connection",
            "component": "TestConnectionButton",
            "props": {
                "plugin_id": "imap"
            }
        }
    ]
}
```

## Recommended Implementation: Extended Schema Protocol

### Backend Changes

1. **Extend `common_config_schema` structure**:
   - Add `ui` field to each schema entry
   - Support component types: `input`, `textarea`, `select`, `file`, `directory`, `checkbox`, `number`
   - Support UI metadata: `help_text`, `help_link`, `placeholder`, `validation`, `actions`

2. **Create UI schema validator**:
   - Validate UI schema structure
   - Ensure component types are supported

### Frontend Changes

1. **Create generic UI renderer component**:
   ```vue
   <PluginFieldRenderer
     :schema="schema"
     :value="value"
     :plugin-id="pluginId"
     @update="updateValue"
   />
   ```

2. **Support all component types**:
   - `input`: Text input
   - `password`: Password input
   - `textarea`: Multi-line text
   - `select`: Dropdown
   - `file`: File picker
   - `directory`: Directory picker with browse button
   - `checkbox`: Boolean toggle
   - `number`: Number input with min/max

3. **Support UI metadata**:
   - Help text and links
   - Placeholders
   - Validation
   - Custom action buttons

4. **Remove hardcoded special cases**:
   - All plugins use the same generic renderer
   - No frontend code changes needed for new plugins

### Example Implementation

**Backend (plugin registration):**
```python
{
    "type_id": "imap",
    "common_config_schema": {
        "email_address": {
            "type": "string",
            "description": "Email address",
            "default": "",
            "ui": {
                "component": "input",
                "placeholder": "your.email@example.com",
                "validation": {"required": True, "type": "email"}
            }
        },
        "email_password": {
            "type": "password",
            "description": "Password or App Password",
            "default": "",
            "ui": {
                "component": "password",
                "placeholder": "Enter password or App Password",
                "help_text": "For Gmail, use an App Password instead of your regular password"
            }
        },
        "image_dir": {
            "type": "string",
            "description": "Directory to save images",
            "default": "",
            "ui": {
                "component": "directory",
                "browse_button": True,
                "placeholder": "Select directory..."
            }
        }
    }
}
```

**Frontend (generic renderer):**
```vue
<template>
  <div class="plugin-field">
    <label>{{ schema.description || key }}</label>
    
    <!-- Input types -->
    <input
      v-if="ui.component === 'input'"
      type="text"
      :value="value"
      :placeholder="ui.placeholder"
      @input="$emit('update', $event.target.value)"
    />
    
    <!-- Directory with browse button -->
    <div v-else-if="ui.component === 'directory'" class="directory-input">
      <input
        type="text"
        :value="value"
        :placeholder="ui.placeholder"
        @input="$emit('update', $event.target.value)"
      />
      <button v-if="ui.browse_button" @click="browseDirectory">
        Browse
      </button>
    </div>
    
    <!-- Help text and links -->
    <span v-if="ui.help_text" class="help-text">
      {{ ui.help_text }}
      <a v-if="ui.help_link" :href="ui.help_link" target="_blank">
        {{ ui.help_link }}
      </a>
    </span>
    
    <!-- Action buttons -->
    <div v-if="ui.actions" class="field-actions">
      <button
        v-for="action in ui.actions"
        :key="action.label"
        @click="handleAction(action)"
      >
        {{ action.label }}
      </button>
    </div>
  </div>
</template>
```

## Migration Path

1. **Phase 1**: Extend schema structure, keep backward compatibility
2. **Phase 2**: Create generic renderer component
3. **Phase 3**: Migrate existing plugins to new schema format
4. **Phase 4**: Remove hardcoded special cases

## Benefits

- ✅ **True plug-and-play**: Plugins define their own UI
- ✅ **No frontend changes**: New plugins work automatically
- ✅ **Consistent UI**: All plugins use the same renderer
- ✅ **Flexible**: Support for complex UI needs
- ✅ **Type-safe**: Schema validation ensures correctness

## Future Enhancements

- Support for custom Vue components (Option 2)
- Plugin-provided CSS/styling
- Plugin-provided JavaScript for custom behavior
- Plugin marketplace with UI previews



