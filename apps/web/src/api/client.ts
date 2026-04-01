import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import queryClient from './queryClient'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT on every request
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 401 → logout
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      queryClient.clear()
      useAuthStore.getState().logout()
    }
    return Promise.reject(err)
  }
)

export default client
