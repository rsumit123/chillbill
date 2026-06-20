import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import GoogleSignInButton from '../components/GoogleSignInButton.jsx'
import { api } from '../services/api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../components/Toast.jsx'

export default function LoginPage() {
  const { setAuthData } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [showEmail, setShowEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onEmailSubmit(e) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email: email.trim(), password })
      setAuthData(res.user, res.tokens)
      push('Signed in successfully', 'success')
      navigate('/dashboard')
    } catch (err) {
      setError(err?.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-neutral-900 dark:to-neutral-950 flex flex-col">
      {/* Back to home */}
      <div className="p-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Home
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 pb-8">
        <div className="w-full max-w-sm mx-auto">
          {/* Branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-4 shadow-lg shadow-blue-500/25">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-1 text-neutral-900 dark:text-neutral-100">Halvio</h1>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm">Halve it. Settle it. Done.</p>
          </div>

          {/* Auth card */}
          <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/80 dark:bg-neutral-900/80 backdrop-blur p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-center mb-2 text-neutral-900 dark:text-neutral-100">Sign in to continue</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-6">New here? Your account is created automatically.</p>

            <GoogleSignInButton disabled={loading} />

            {error && (
              <div className="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {!showEmail ? (
              <button
                type="button"
                onClick={() => setShowEmail(true)}
                className="mt-4 w-full text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              >
                Sign in with email
              </button>
            ) : (
              <form onSubmit={onEmailSubmit} className="mt-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">or use email</span>
                  <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <button
                  disabled={loading || !email.trim() || !password}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-blue-600/20"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
