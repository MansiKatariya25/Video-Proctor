import axios from 'axios'

// Create a configured Axios instance with base URL & interceptors
const api = axios.create({
  baseURL: import.meta.env.VITE_BASE_URL || '/api',
  withCredentials: false,
})

export function getWsUrl(path = '/ws') {
  const envWs = import.meta.env.VITE_WS_URL
  if (envWs) {
    return envWs.endsWith(path) ? envWs : `${envWs.replace(/\/?$/, '')}${path}`
  }
  const base = import.meta.env.VITE_BASE_URL
  if (base) {
    try {
      const u = new URL(base)
      const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${proto}//${u.host}${path}`
    } catch (e) {
      // ignore and fall back
    }
  }
  const locProto = (typeof window !== 'undefined' && window.location?.protocol === 'https:') ? 'wss:' : 'ws:'
  const host = (typeof window !== 'undefined' && window.location?.host) || 'localhost:5173'
  return `${locProto}//${host}${path}`
}

// Request interceptor: attach auth token and JSON headers
api.interceptors.request.use((config) => {
  const token = (typeof localStorage !== 'undefined') ? localStorage.getItem('auth.token') : null
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
    config.headers['x-auth-token'] = token
  }
  if (!config.headers || !('Content-Type' in config.headers)) {
    // Let browser set for FormData; otherwise default JSON
    if (!(config.data instanceof FormData)) {
      config.headers = config.headers || {}
      config.headers['Content-Type'] = 'application/json'
    }
  }
  return config
})

// Optional response interceptor to unwrap data
api.interceptors.response.use(
  (resp) => resp,
  (error) => Promise.reject(error)
)

export default api
