/** Test setup file for Vitest. */

import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/vue'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Handle unhandled promise rejections that can't be serialized
// This is a known issue with Vitest and axios/router error objects containing functions
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    // Suppress DataCloneError from serialization issues
    if (event.reason && typeof event.reason === 'object' && 'code' in event.reason && event.reason.code === 25) {
      event.preventDefault()
      return
    }
  })
}
