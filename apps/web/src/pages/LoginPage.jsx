import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../components/Toast.jsx'

export default function LoginPage() {
  const { login } = useAuth()
  const { push } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const emailValid = useMemo(() => /.+@.+\..+/.test(email), [email])
  const passwordValid = useMemo(() => password.length >= 6, [password])
  const formValid = emailValid && passwordValid

  async function onSubmit(e) {
    e.preventDefault()
    if (!formValid) return
    setError('')
    setLoading(true)
    try {
      await login(email.trim(), password)
      push('Signed in successfully', 'success')
      navigate('/')
    } catch (err) {
      setError(err.message || 'Invalid email or password')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-neutral-900 dark:to-neutral-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div className="hidden md:block">
          <div className="text-3xl font-semibold mb-3">ChillBill</div>
          <p className="text-neutral-600 dark:text-neutral-300 text-lg">Split expenses effortlessly. Keep trips, households, and events fair and transparent.</p>
          <div className="mt-8 rounded-xl border bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-6">
            <div className="text-sm text-neutral-700 dark:text-neutral-200">Tip</div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Use the same account across devices; your data stays synced.</div>
          </div>
        </div>
        <div className="w-full max-w-md md:ml-auto">
          <div className="rounded-2xl border bg-white/80 dark:bg-neutral-900/80 backdrop-blur p-6 shadow-sm">
            <h1 className="text-xl font-semibold mb-1">Welcome back</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">Sign in to continue</p>
            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="text-sm text-neutral-600 dark:text-neutral-300">Email</label>
                <input type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} className={`w-full border rounded-md px-3 py-2 mt-1 ${email && !emailValid?'border-red-500':''}`} required />
                {email && !emailValid && <div className="text-xs text-red-600 mt-1">Enter a valid email</div>}
              </div>
              <div>
                <label className="text-sm text-neutral-600 dark:text-neutral-300">Password</label>
                <input type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} className={`w-full border rounded-md px-3 py-2 mt-1 ${password && !passwordValid?'border-red-500':''}`} required />
                {password && !passwordValid && <div className="text-xs text-red-600 mt-1">Minimum 6 characters</div>}
              </div>
              <button disabled={loading || !formValid} className="w-full bg-blue-600 text-white rounded-md py-2 disabled:opacity-50">{loading?'Signing in…':'Sign in'}</button>
            </form>
            <div className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">No account? <Link to="/signup" className="text-blue-600">Create one</Link></div>
          </div>
        </div>
      </div>
    </div>
  )
}


