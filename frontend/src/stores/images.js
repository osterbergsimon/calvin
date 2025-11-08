import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useImagesStore = defineStore('images', () => {
  const images = ref([])
  const currentImage = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const fetchImages = async () => {
    loading.value = true
    error.value = null
    try {
      const response = await axios.get('/api/images/list')
      images.value = response.data.images || []
      // If we have images but no current image, fetch current
      if (images.value.length > 0 && !currentImage.value) {
        await fetchCurrentImage()
      }
      return response.data
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch images:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const fetchCurrentImage = async () => {
    try {
      const response = await axios.get('/api/images/current')
      currentImage.value = response.data.image
      return response.data
    } catch (err) {
      console.error('Failed to fetch current image:', err)
      throw err
    }
  }

  const nextImage = async () => {
    try {
      const response = await axios.post('/api/images/next')
      currentImage.value = response.data.image
      return response.data
    } catch (err) {
      console.error('Failed to go to next image:', err)
      throw err
    }
  }

  const previousImage = async () => {
    try {
      const response = await axios.post('/api/images/previous')
      currentImage.value = response.data.image
      return response.data
    } catch (err) {
      console.error('Failed to go to previous image:', err)
      throw err
    }
  }

  const getCurrentImageUrl = computed(() => {
    if (!currentImage.value) return null
    return `/api/images/${currentImage.value.id}`
  })

  return {
    images,
    currentImage,
    loading,
    error,
    fetchImages,
    fetchCurrentImage,
    nextImage,
    previousImage,
    getCurrentImageUrl,
  }
})

