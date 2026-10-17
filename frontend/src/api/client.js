const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '')
const TOKEN_KEY = 'shopease_token'

export const SESSION_EXPIRED = 'Your session has expired. Please log in again'

export class ApiError extends Error {
  constructor(status, message, { errors = [], data = {}, retryAfter = null } = {}) {
    super(message)
    this.status = status
    this.errors = Array.isArray(errors) ? errors : []
    this.data = data
    this.retryAfter = retryAfter
  }
  /** Map of field -> message built from the errors array of the API. */
  get fields() {
    const out = {}
    for (const e of this.errors) if (e && e.field && !out[e.field]) out[e.field] = e.message
    return out
  }
}

let token = null
try { token = localStorage.getItem(TOKEN_KEY) } catch { token = null }

export function getToken() { return token }
export function setToken(t) {
  token = t
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

function buildQuery(params) {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export async function request(method, path, { body, params, auth = true } = {}) {
  const headers = { Accept: 'application/json' }
  const sentToken = auth && token
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (sentToken) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(`${BASE}${path}${buildQuery(params)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Please check your connection and try again.')
  }
  let data = null
  try { data = await res.json() } catch { data = null }
  if (!res.ok) {
    let message = (data && data.message) || 'Something went wrong. Please try again later.'
    if (res.status === 401 && sentToken) {
      message = SESSION_EXPIRED
      window.dispatchEvent(new CustomEvent('auth:expired', { detail: message }))
    }
    const ra = res.headers.get('Retry-After')
    throw new ApiError(res.status, message, {
      errors: data && data.errors,
      data: data || {},
      retryAfter: ra ? parseInt(ra, 10) : null,
    })
  }
  return data
}
