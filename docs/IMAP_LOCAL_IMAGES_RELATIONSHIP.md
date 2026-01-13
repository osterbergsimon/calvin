# IMAP Plugin and Local Images Relationship

## Overview

The IMAP plugin and Local Images plugin are **separate, independent image plugins** that can work together or independently.

## How They Work

### Local Images Plugin
- **Type**: `local`
- **Purpose**: Manages images uploaded directly to the server
- **Default Directory**: `./data/images`
- **Behavior**: 
  - Users upload images via the web UI
  - Images are stored in the configured directory
  - Plugin scans the directory and serves images

### IMAP Plugin (Backend Plugin)
- **Type**: `backend` (converted from `image` plugin)
- **Purpose**: Downloads images from email attachments to local directory
- **Default Directory**: `./data/images` (same as local images)
- **Behavior**:
  - Connects to IMAP email server (Gmail, Outlook, etc.)
  - Checks for emails with image attachments (via scheduled tasks)
  - Downloads images to configured directory
  - **Does NOT serve images directly** - relies on LocalImagePlugin for display

## Directory Relationship

### Default Behavior (Shared Directory)
By default, both plugins use the same directory (`./data/images`):
- **Local Images** stores uploaded images there
- **IMAP** downloads email images there
- Both plugins scan the same directory
- Images from both sources appear together in the slideshow

### Custom Directories (Separate)
Each plugin can be configured with a different directory:
- **Local Images**: Can use `./data/images/local`
- **IMAP**: Can use `./data/images/imap` or any custom path
- Each plugin only sees images in its own directory
- Images are kept separate

## Configuration

### IMAP Plugin Configuration
```json
{
  "image_dir": "./data/images/imap"  // Optional: defaults to ./data/images
}
```

### Local Images Plugin Configuration
```json
{
  "image_dir": "./data/images/local"  // Optional: defaults to ./data/images
}
```

## Use Cases

### Shared Directory (Default)
- **Use case**: Simple setup where all images appear together
- **Pros**: 
  - Single source of truth
  - Easy to manage
  - Images from email and uploads appear together
- **Cons**: 
  - Can't distinguish source of images
  - Potential filename conflicts

### Separate Directories
- **Use case**: Want to keep email images separate from uploaded images
- **Pros**:
  - Clear separation of image sources
  - No filename conflicts
  - Can disable one plugin without affecting the other
- **Cons**:
  - More complex configuration
  - Images appear in separate rotations (unless both plugins enabled)

## Ordering

Both plugins respect the image ordering system:
- Plugin-level ordering: Controls which plugin's images appear first
- Instance-level ordering: Controls order of multiple IMAP instances (if configured)
- Images are combined in order: Plugin 1 images → Plugin 2 images → etc.

## Best Practices

1. **For most users**: Use default shared directory - simple and works well
2. **For organization**: Use separate directories if you want to keep sources distinct
3. **For multiple IMAP accounts**: Each instance can use its own directory or share one
4. **Ordering**: Set display_order to control which plugin's images appear first


