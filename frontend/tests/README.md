# Frontend Tests

This directory contains tests for the Calvin frontend.

## Structure

- `setup.js` - Test setup and configuration
- `unit/` - Unit tests for components and stores
- `integration/` - Integration tests (if needed)
- `e2e/` - End-to-end tests (if needed)

## Running Tests

### All tests
```bash
cd frontend
npm run test
```

### Watch mode
```bash
npm run test:watch
```

### With UI
```bash
npm run test:ui
```

### With coverage
```bash
npm run test:coverage
```

### Specific test file
```bash
npm run test tests/unit/stores/config.spec.js
```

## Test Setup

The test setup file (`setup.js`) configures:
- Vitest globals
- Testing Library matchers
- Automatic cleanup after each test

## Writing Tests

### Store Tests

Example store test:
```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConfigStore } from '@/stores/config'

describe('Config Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with defaults', () => {
    const store = useConfigStore()
    expect(store.orientation).toBe('landscape')
  })
})
```

### Component Tests

Example component test:
```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MyComponent from '@/components/MyComponent.vue'

describe('MyComponent', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders correctly', () => {
    const wrapper = mount(MyComponent)
    expect(wrapper.text()).toContain('Expected text')
  })
})
```

