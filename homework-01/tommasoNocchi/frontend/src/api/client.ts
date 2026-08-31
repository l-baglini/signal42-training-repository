import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = useAuthStore.getState().refreshToken
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE}/auth/refresh`, { refresh_token: refreshToken })
          const newToken = res.data.access_token
          useAuthStore.getState().setToken(newToken)
          original.headers.Authorization = `Bearer ${newToken}`
          return apiClient(original)
        } catch {
          useAuthStore.getState().logout()
        }
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
