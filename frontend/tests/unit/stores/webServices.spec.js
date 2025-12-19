/** Tests for web services store. */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWebServicesStore } from '@/stores/webServices'
import axios from 'axios'

// Mock axios
vi.mock('axios')

describe('Web Services Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should initialize with default values', () => {
    const store = useWebServicesStore()
    
    expect(store.services).toEqual([])
    expect(store.currentServiceIndex).toBe(0)
    expect(store.loading).toBe(false)
    expect(store.error).toBe(null)
  })

  it('should fetch web services', async () => {
    const mockServices = [
      { id: 'svc1', name: 'Service 1', url: 'https://example.com', enabled: true, display_order: 0 },
      { id: 'svc2', name: 'Service 2', url: 'https://test.com', enabled: true, display_order: 1 },
    ]
    
    axios.get.mockResolvedValue({ data: { services: mockServices } })
    
    const store = useWebServicesStore()
    await store.fetchServices()
    
    expect(axios.get).toHaveBeenCalledWith('/api/web-services')
    expect(store.services).toEqual(mockServices)
    expect(store.loading).toBe(false)
  })

  it('should filter out disabled services', async () => {
    const mockServices = [
      { id: 'svc1', name: 'Service 1', enabled: true, display_order: 0 },
      { id: 'svc2', name: 'Service 2', enabled: false, display_order: 1 },
      { id: 'svc3', name: 'Service 3', enabled: true, display_order: 2 },
    ]
    
    axios.get.mockResolvedValue({ data: { services: mockServices } })
    
    const store = useWebServicesStore()
    await store.fetchServices()
    
    expect(store.services.length).toBe(2)
    expect(store.services.map(s => s.id)).toEqual(['svc1', 'svc3'])
  })

  it('should sort services by display_order', async () => {
    const mockServices = [
      { id: 'svc3', name: 'Service 3', enabled: true, display_order: 2 },
      { id: 'svc1', name: 'Service 1', enabled: true, display_order: 0 },
      { id: 'svc2', name: 'Service 2', enabled: true, display_order: 1 },
    ]
    
    axios.get.mockResolvedValue({ data: { services: mockServices } })
    
    const store = useWebServicesStore()
    await store.fetchServices()
    
    expect(store.services.map(s => s.id)).toEqual(['svc1', 'svc2', 'svc3'])
  })

  it('should reset current index if out of bounds', async () => {
    const mockServices = [
      { id: 'svc1', name: 'Service 1', enabled: true, display_order: 0 },
    ]
    
    axios.get.mockResolvedValue({ data: { services: mockServices } })
    
    const store = useWebServicesStore()
    store.currentServiceIndex = 5 // Out of bounds
    
    await store.fetchServices()
    
    expect(store.currentServiceIndex).toBe(0)
  })

  it('should handle fetch services errors', async () => {
    const error = new Error('Network error')
    axios.get.mockRejectedValue(error)
    
    const store = useWebServicesStore()
    
    await expect(store.fetchServices()).rejects.toThrow('Network error')
    expect(store.error).toBe('Network error')
    expect(store.loading).toBe(false)
  })

  it('should add service', async () => {
    const newService = { name: 'New Service', url: 'https://new.com', enabled: true }
    const mockServices = [
      { id: 'svc1', name: 'Service 1', enabled: true, display_order: 0 },
      { id: 'svc2', ...newService, display_order: 1 },
    ]
    
    axios.post.mockResolvedValue({ data: { id: 'svc2', ...newService } })
    axios.get.mockResolvedValue({ data: { services: mockServices } })
    
    const store = useWebServicesStore()
    await store.addService(newService)
    
    expect(axios.post).toHaveBeenCalledWith('/api/web-services', newService)
    expect(axios.get).toHaveBeenCalledWith('/api/web-services')
  })

  it('should update service', async () => {
    const updates = { name: 'Updated Service' }
    const mockServices = [
      { id: 'svc1', name: 'Updated Service', enabled: true, display_order: 0 },
    ]
    
    axios.put.mockResolvedValue({ data: { id: 'svc1', ...updates } })
    axios.get.mockResolvedValue({ data: { services: mockServices } })
    
    const store = useWebServicesStore()
    await store.updateService('svc1', updates)
    
    expect(axios.put).toHaveBeenCalledWith('/api/web-services/svc1', updates)
    expect(axios.get).toHaveBeenCalledWith('/api/web-services')
  })

  it('should remove service', async () => {
    const mockServices = []
    
    axios.delete.mockResolvedValue({ data: { message: 'Deleted' } })
    axios.get.mockResolvedValue({ data: { services: mockServices } })
    
    const store = useWebServicesStore()
    await store.removeService('svc1')
    
    expect(axios.delete).toHaveBeenCalledWith('/api/web-services/svc1')
    expect(axios.get).toHaveBeenCalledWith('/api/web-services')
  })

  it('should get current service', () => {
    const store = useWebServicesStore()
    
    expect(store.getCurrentService()).toBe(null)
    
    store.services = [
      { id: 'svc1', name: 'Service 1' },
      { id: 'svc2', name: 'Service 2' },
    ]
    store.currentServiceIndex = 0
    
    expect(store.getCurrentService()).toEqual({ id: 'svc1', name: 'Service 1' })
    
    store.currentServiceIndex = 1
    expect(store.getCurrentService()).toEqual({ id: 'svc2', name: 'Service 2' })
  })

  it('should go to next service', () => {
    const store = useWebServicesStore()
    store.services = [
      { id: 'svc1', name: 'Service 1' },
      { id: 'svc2', name: 'Service 2' },
      { id: 'svc3', name: 'Service 3' },
    ]
    
    store.currentServiceIndex = 0
    store.nextService()
    expect(store.currentServiceIndex).toBe(1)
    
    store.nextService()
    expect(store.currentServiceIndex).toBe(2)
    
    store.nextService() // Should wrap around
    expect(store.currentServiceIndex).toBe(0)
  })

  it('should go to previous service', () => {
    const store = useWebServicesStore()
    store.services = [
      { id: 'svc1', name: 'Service 1' },
      { id: 'svc2', name: 'Service 2' },
      { id: 'svc3', name: 'Service 3' },
    ]
    
    store.currentServiceIndex = 1
    store.previousService()
    expect(store.currentServiceIndex).toBe(0)
    
    store.previousService() // Should wrap around
    expect(store.currentServiceIndex).toBe(2)
  })

  it('should not navigate if no services', () => {
    const store = useWebServicesStore()
    store.services = []
    store.currentServiceIndex = 0
    
    store.nextService()
    expect(store.currentServiceIndex).toBe(0)
    
    store.previousService()
    expect(store.currentServiceIndex).toBe(0)
  })

  it('should set service index', () => {
    const store = useWebServicesStore()
    store.services = [
      { id: 'svc1', name: 'Service 1' },
      { id: 'svc2', name: 'Service 2' },
    ]
    
    store.setServiceIndex(1)
    expect(store.currentServiceIndex).toBe(1)
    
    store.setServiceIndex(0)
    expect(store.currentServiceIndex).toBe(0)
    
    // Should not change if index is out of bounds
    store.setServiceIndex(5)
    expect(store.currentServiceIndex).toBe(0)
    
    store.setServiceIndex(-1)
    expect(store.currentServiceIndex).toBe(0)
  })
})

