import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../components/Toast.jsx'

export default function SignupPage() {
  const { signup } = useAuth()
  const { push } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email), [email])
  const passwordValid = useMemo(() => password.length >= 6, [password])
  const nameValid = useMemo(() => name.trim().length >= 2, [name])
  const formValid = emailValid && passwordValid && nameValid

  async function onSubmit(e) {
    e.preventDefault()
    if (!formValid) return
    setError('')
    setLoading(true)
    try {
      await signup(name.trim(), email.trim(), password)
      push('Account created', 'success')
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Email already exists or invalid')
    } finally { setLoading(false) }
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
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Desktop branding */}
          <div className="hidden md:block">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="text-3xl font-semibold">Join ChillBill</span>
            </div>
            <p className="text-neutral-600 dark:text-neutral-300 text-lg leading-relaxed">Start sharing expenses in seconds. Invite friends now or later.</p>
            <div className="mt-8 rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-5">
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">Privacy</div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">We only use your email for login and invites you initiate.</div>
            </div>
          </div>

          {/* Mobile branding */}
          <div className="md:hidden text-center mb-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-4 shadow-lg shadow-blue-500/25">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-1 text-neutral-900 dark:text-neutral-100">ChillBill</h1>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm">Create groups. Share bills. Stay fair.</p>
          </div>

          {/* Form card */}
          <div className="w-full max-w-md mx-auto md:ml-auto">
            <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/80 dark:bg-neutral-900/80 backdrop-blur p-6 sm:p-8 shadow-sm">
              <h1 className="text-xl font-semibold mb-1 text-neutral-900 dark:text-neutral-100">Create your account</h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">It's fast and free</p>
              {error && (
                <div className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Name</label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${name && !nameValid ? 'border-red-400 dark:border-red-500' : 'border-neutral-300 dark:border-neutral-700'}`}
                    required
                    autoComplete="name"
                  />
                  {name && !nameValid && <div className="text-xs text-red-500 mt-1.5">Enter at least 2 characters</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${email && !emailValid ? 'border-red-400 dark:border-red-500' : 'border-neutral-300 dark:border-neutral-700'}`}
                    required
                    autoComplete="email"
                  />
                  {email && !emailValid && <div className="text-xs text-red-500 mt-1.5">Enter a valid email address</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 text-sm bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all ${password && !passwordValid ? 'border-red-400 dark:border-red-500' : 'border-neutral-300 dark:border-neutral-700'}`}
                    required
                    autoComplete="new-password"
                  />
                  {password && !passwordValid && <div className="text-xs text-red-500 mt-1.5">Minimum 6 characters</div>}
                </div>
                <button
                  disabled={loading || !formValid}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-blue-600/20"
                >
                  {loading ? 'Creating...' : 'Create account'}
                </button>
              </form>
              <div className="mt-5 text-sm text-center text-neutral-500 dark:text-neutral-400">
                Have an account? <Link to="/login" className="text-blue-600 dark:text-blue-400 font-medium hover:underline">Sign in</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
