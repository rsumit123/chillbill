const BASE_URL = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api/v1'

async function request(path, { method = 'GET', body, token, headers } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })
  if (!res.ok) {
    let detail = 'Request failed'
    try { const data = await res.json(); detail = data.detail || JSON.stringify(data) } catch {}
    const err = new Error(detail)
    err.status = res.status
    throw err
  }
  if (res.status === 204) return null
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    // Some 204/empty responses may still claim JSON; guard against empty body
    const text = await res.text()
    if (!text) return null
    try { return JSON.parse(text) } catch { return null }
  }
  return res.text()
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
}


