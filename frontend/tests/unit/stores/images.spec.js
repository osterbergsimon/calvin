/** Tests for images store. */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useImagesStore } from '@/stores/images'
import axios from 'axios'

// Mock axios
vi.mock('axios')

describe('Images Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should initialize with default values', () => {
    const store = useImagesStore()
    
    expect(store.images).toEqual([])
    expect(store.currentImage).toBe(null)
    expect(store.loading).toBe(false)
    expect(store.error).toBe(null)
  })

  it('should fetch images', async () => {
    const mockImages = [
      { id: 'img1', filename: 'image1.jpg', path: '/path/to/image1.jpg' },
      { id: 'img2', filename: 'image2.jpg', path: '/path/to/image2.jpg' },
    ]
    
    axios.get.mockResolvedValue({ data: { images: mockImages } })
    axios.get.mockResolvedValueOnce({ data: { images: mockImages } })
    axios.get.mockResolvedValueOnce({ data: { image: mockImages[0] } })
    
    const store = useImagesStore()
    await store.fetchImages()
    
    expect(axios.get).toHaveBeenCalledWith('/api/images/list')
    expect(store.images).toEqual(mockImages)
    expect(store.loading).toBe(false)
  })

  it('should fetch current image when images are available', async () => {
    const mockImages = [
      { id: 'img1', filename: 'image1.jpg' },
    ]
    const mockCurrent = { id: 'img1', filename: 'image1.jpg' }
    
    axios.get
      .mockResolvedValueOnce({ data: { images: mockImages } })
      .mockResolvedValueOnce({ data: { image: mockCurrent } })
    
    const store = useImagesStore()
    await store.fetchImages()
    
    expect(axios.get).toHaveBeenCalledWith('/api/images/current')
    expect(store.currentImage).toEqual(mockCurrent)
  })

  it('should handle fetch images errors', async () => {
    const error = new Error('Network error')
    axios.get.mockRejectedValue(error)
    
    const store = useImagesStore()
    
    await expect(store.fetchImages()).rejects.toThrow('Network error')
    expect(store.error).toBe('Network error')
    expect(store.loading).toBe(false)
  })

  it('should fetch current image', async () => {
    const mockImage = { id: 'img1', filename: 'image1.jpg' }
    
    axios.get.mockResolvedValue({ data: { image: mockImage } })
    
    const store = useImagesStore()
    await store.fetchCurrentImage()
    
    expect(axios.get).toHaveBeenCalledWith('/api/images/current')
    expect(store.currentImage).toEqual(mockImage)
  })

  it('should go to next image', async () => {
    const mockImage = { id: 'img2', filename: 'image2.jpg' }
    
    axios.post.mockResolvedValue({ data: { image: mockImage } })
    
    const store = useImagesStore()
    await store.nextImage()
    
    expect(axios.post).toHaveBeenCalledWith('/api/images/next')
    expect(store.currentImage).toEqual(mockImage)
  })

  it('should go to previous image', async () => {
    const mockImage = { id: 'img1', filename: 'image1.jpg' }
    
    axios.post.mockResolvedValue({ data: { image: mockImage } })
    
    const store = useImagesStore()
    await store.previousImage()
    
    expect(axios.post).toHaveBeenCalledWith('/api/images/previous')
    expect(store.currentImage).toEqual(mockImage)
  })

  it('should compute current image URL', () => {
    const store = useImagesStore()
    
    expect(store.getCurrentImageUrl).toBe(null)
    
    store.currentImage = { id: 'img1', filename: 'image1.jpg' }
    
    expect(store.getCurrentImageUrl).toBe('/api/images/img1')
  })

  it('should upload image', async () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    const mockResponse = {
      message: 'Image uploaded successfully',
      image: { id: 'img1', filename: 'test.jpg' },
    }
    
    axios.post.mockResolvedValue({ data: mockResponse })
    axios.get.mockResolvedValue({ data: { images: [mockResponse.image] } })
    
    const store = useImagesStore()
    await store.uploadImage(file)
    
    expect(axios.post).toHaveBeenCalledWith('/api/images/upload', expect.any(FormData))
    expect(store.loading).toBe(false)
  })

  it('should handle upload image errors', async () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    const error = new Error('Upload failed')
    
    axios.post.mockRejectedValue(error)
    
    const store = useImagesStore()
    
    await expect(store.uploadImage(file)).rejects.toThrow('Upload failed')
    expect(store.error).toBe('Upload failed')
    expect(store.loading).toBe(false)
  })

  it('should delete image', async () => {
    const mockImages = [
      { id: 'img1', filename: 'image1.jpg' },
      { id: 'img2', filename: 'image2.jpg' },
    ]
    
    axios.delete.mockResolvedValue({ data: { message: 'Deleted' } })
    axios.get
      .mockResolvedValueOnce({ data: { images: mockImages } })
      .mockResolvedValueOnce({ data: { image: mockImages[1] } })
    
    const store = useImagesStore()
    store.currentImage = { id: 'img1' }
    
    await store.deleteImage('img1')
    
    expect(axios.delete).toHaveBeenCalledWith('/api/images/img1')
    expect(axios.get).toHaveBeenCalledWith('/api/images/current')
  })

  it('should not fetch current image if deleted image is not current', async () => {
    const mockImages = [
      { id: 'img1', filename: 'image1.jpg' },
      { id: 'img2', filename: 'image2.jpg' },
    ]
    
    axios.delete.mockResolvedValue({ data: { message: 'Deleted' } })
    axios.get.mockResolvedValue({ data: { images: mockImages } })
    
    const store = useImagesStore()
    store.currentImage = { id: 'img2' }
    
    await store.deleteImage('img1')
    
    expect(axios.delete).toHaveBeenCalledWith('/api/images/img1')
    // Should not call fetchCurrentImage since deleted image is not current
    expect(axios.get).not.toHaveBeenCalledWith('/api/images/current')
  })
})

