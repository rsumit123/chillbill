import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setTokenRefreshCallback, setSessionExpiredCallback } from '../services/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cb_user')) || null } catch { return null }
  })
  const [tokens, setTokens] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cb_tokens')) || null } catch { return null }
  })
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    if (user) localStorage.setItem('cb_user', JSON.stringify(user)); else localStorage.removeItem('cb_user')
  }, [user])
  useEffect(() => {
    if (tokens) localStorage.setItem('cb_tokens', JSON.stringify(tokens)); else localStorage.removeItem('cb_tokens')
  }, [tokens])

  // Token refresh function
  const refreshAccessToken = useCallback(async () => {
    if (!tokens?.refresh_token) return null
    
    try {
      console.log('[Auth] Refreshing access token...')
      const res = await api.post('/auth/refresh', { refresh_token: tokens.refresh_token })
      const newAccessToken = res.access_token
      
      setTokens(prev => ({ ...prev, access_token: newAccessToken }))
      console.log('[Auth] Token refreshed successfully')
      return newAccessToken
    } catch (error) {
      console.error('[Auth] Token refresh failed:', error)
      // If refresh fails, log out user
      setUser(null)
      setTokens(null)
      setSessionExpired(true)
      return null
    }
  }, [tokens?.refresh_token])

  // Register token refresh callback with API client
  useEffect(() => {
    setTokenRefreshCallback(refreshAccessToken)
  }, [refreshAccessToken])

  // Register session expired callback
  useEffect(() => {
    setSessionExpiredCallback(() => {
      console.log('[Auth] Session expired')
      setUser(null)
      setTokens(null)
      setSessionExpired(true)
    })
  }, [])

  // Auto-refresh token every 60 minutes (token expires in 120 min)
  useEffect(() => {
    if (!tokens?.refresh_token) return
    
    const id = setInterval(async () => {
      await refreshAccessToken()
    }, 60 * 60 * 1000) // 60 minutes (1 hour)
    
    return () => clearInterval(id)
  }, [tokens?.refresh_token, refreshAccessToken])

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(tokens?.access_token),
    sessionExpired,
    clearSessionExpired: () => setSessionExpired(false),
    login: async (email, password) => {
      const res = await api.post('/auth/login', { email, password })
      setUser(res.user)
      setTokens(res.tokens)
      setSessionExpired(false) // Clear session expired flag on successful login
    },
    signup: async (name, email, password) => {
      const res = await api.post('/auth/signup', { name, email, password })
      setUser(res.user)
      setTokens(res.tokens)
      setSessionExpired(false)
    },
    logout: () => { 
      setUser(null)
      setTokens(null)
      setSessionExpired(false)
    },
    accessToken: tokens?.access_token || null,
    refreshToken: refreshAccessToken,
  }), [user, tokens, sessionExpired, refreshAccessToken])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }


