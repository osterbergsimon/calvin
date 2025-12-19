/** Tests for MinimalUIOverlay component. */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MinimalUIOverlay from '@/components/MinimalUIOverlay.vue'
import { useConfigStore } from '@/stores/config'

describe('MinimalUIOverlay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should render when showUI is false', () => {
    const store = useConfigStore()
    store.setShowUI(false)
    
    const wrapper = mount(MinimalUIOverlay)
    
    expect(wrapper.find('.minimal-ui-overlay').exists()).toBe(true)
    expect(wrapper.find('.ui-toggle-btn').exists()).toBe(true)
  })

  it('should not render when showUI is true', () => {
    const store = useConfigStore()
    store.setShowUI(true)
    
    const wrapper = mount(MinimalUIOverlay)
    
    expect(wrapper.find('.minimal-ui-overlay').exists()).toBe(false)
  })

  it('should toggle UI when button is clicked', async () => {
    const store = useConfigStore()
    store.setShowUI(false)
    
    const wrapper = mount(MinimalUIOverlay)
    const button = wrapper.find('.ui-toggle-btn')
    
    expect(store.showUI).toBe(false)
    
    await button.trigger('click')
    
    expect(store.showUI).toBe(true)
  })

  it('should have correct button attributes', () => {
    const store = useConfigStore()
    store.setShowUI(false)
    
    const wrapper = mount(MinimalUIOverlay)
    const button = wrapper.find('.ui-toggle-btn')
    
    expect(button.attributes('title')).toBe('Show UI')
    expect(button.attributes('aria-label')).toBe('Show UI')
  })
})


