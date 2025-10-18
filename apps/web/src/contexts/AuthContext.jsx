import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cb_user')) || null } catch { return null }
  })
  const [tokens, setTokens] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cb_tokens')) || null } catch { return null }
  })

  useEffect(() => {
    if (user) localStorage.setItem('cb_user', JSON.stringify(user)); else localStorage.removeItem('cb_user')
  }, [user])
  useEffect(() => {
    if (tokens) localStorage.setItem('cb_tokens', JSON.stringify(tokens)); else localStorage.removeItem('cb_tokens')
  }, [tokens])

  useEffect(() => {
    if (!tokens?.refresh_token) return
    const id = setInterval(async () => {
      try {
        const res = await api.post('/auth/refresh', { refresh_token: tokens.refresh_token })
        setTokens(t => ({ ...t, access_token: res.access_token }))
      } catch (_) {}
    }, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [tokens?.refresh_token])

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(tokens?.access_token),
    login: async (email, password) => {
      const res = await api.post('/auth/login', { email, password })
      setUser(res.user)
      setTokens(res.tokens)
    },
    signup: async (name, email, password) => {
      const res = await api.post('/auth/signup', { name, email, password })
      setUser(res.user)
      setTokens(res.tokens)
    },
    logout: () => { setUser(null); setTokens(null) },
    accessToken: tokens?.access_token || null,
  }), [user, tokens])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }


