import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { api } from '../services/api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from './Toast.jsx'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const isNative = Capacitor.isNativePlatform()

export default function GoogleSignInButton({ disabled }) {
  const { setAuthData } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  // Initialize the native Google Auth plugin once on native platforms.
  useEffect(() => {
    if (!isNative || !GOOGLE_CLIENT_ID) return
    import('@codetrix-studio/capacitor-google-auth').then(({ GoogleAuth }) => {
      GoogleAuth.initialize({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: false,
      })
    })
  }, [])

  async function handleNativeSignIn() {
    setBusy(true)
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth')
      const result = await GoogleAuth.signIn()
      const idToken = result?.authentication?.idToken
      if (!idToken) throw new Error('No ID token from Google')

      const res = await api.post('/auth/google/token', { id_token: idToken })
      setAuthData(res.user, res.tokens)
      push('Signed in successfully', 'success')
      navigate('/dashboard')
    } catch (err) {
      console.error('[GoogleAuth] native sign-in failed', err)
      push('Google sign-in failed', 'error')
      setBusy(false)
    }
  }

  async function handleWebSignIn() {
    try {
      const { auth_url } = await api.get('/auth/google/login')
      window.location.href = auth_url
    } catch {
      push('Failed to connect to server', 'error')
    }
  }

  const handleClick = isNative ? handleNativeSignIn : handleWebSignIn

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={handleClick}
      className="w-full flex items-center justify-center gap-3 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-medium rounded-xl py-3 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      {busy ? 'Signing in…' : 'Sign in with Google'}
    </button>
  )
}
