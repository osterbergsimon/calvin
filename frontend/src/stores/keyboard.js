import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useKeyboardStore = defineStore('keyboard', () => {
  const mappings = ref({})
  const keyboardType = ref('7-button') // Current keyboard type
  const available = ref(false)
  const loading = ref(false)
  const error = ref(null)

  const fetchMappings = async (keyboardType = null) => {
    loading.value = true
    error.value = null
    try {
      const url = keyboardType
        ? `/api/keyboard/mappings?keyboard_type=${keyboardType}`
        : '/api/keyboard/mappings'
      const response = await axios.get(url)
      mappings.value = response.data.mappings || {}
      available.value = true
      return response.data
    } catch (err) {
      error.value = err.message
      console.error('Failed to fetch keyboard mappings:', err)
      available.value = false
      throw err
    } finally {
      loading.value = false
    }
  }

  const updateMappings = async (newMappings) => {
    loading.value = true
    error.value = null
    try {
      const response = await axios.post('/api/keyboard/mappings', { mappings: newMappings })
      mappings.value = response.data.mappings || {}
      return response.data
    } catch (err) {
      error.value = err.message
      console.error('Failed to update keyboard mappings:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const setKeyboardType = (type) => {
    keyboardType.value = type
  }

  return {
    mappings,
    keyboardType,
    available,
    loading,
    error,
    fetchMappings,
    updateMappings,
    setKeyboardType,
  }
})

