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

  const emailValid = useMemo(() => /.+@.+\..+/.test(email), [email])
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
      navigate('/')
    } catch (err) {
      // Surface user exists check if backend responds 400
      setError(err.message || 'Email already exists or invalid')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-purple-50 dark:from-neutral-900 dark:to-neutral-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Desktop branding */}
        <div className="hidden md:block">
          <div className="text-3xl font-semibold mb-3">Join ChillBill</div>
          <p className="text-neutral-600 dark:text-neutral-300 text-lg">Start sharing expenses in seconds. Invite friends now or later.</p>
          <div className="mt-8 rounded-xl border bg-white/60 dark:bg-neutral-900/60 backdrop-blur p-6">
            <div className="text-sm text-neutral-700 dark:text-neutral-200">Privacy</div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">We only use your email for login and invites you initiate.</div>
          </div>
        </div>
        
        {/* Mobile branding - shown on small screens */}
        <div className="md:hidden text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-rose-500 to-purple-600 mb-4 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">ChillBill</h1>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm px-4">Create groups. Share bills. Never argue about money again.</p>
        </div>
        
        <div className="w-full max-w-md md:ml-auto">
          <div className="rounded-2xl border bg-white/80 dark:bg-neutral-900/80 backdrop-blur p-6 shadow-sm">
            <h1 className="text-xl font-semibold mb-1">Create your account</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">It’s fast and free</p>
            {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="text-sm text-neutral-600 dark:text-neutral-300">Name</label>
                <input type="text" placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} className={`w-full border rounded-md px-3 py-2 mt-1 ${name && !nameValid?'border-red-500':''}`} required />
                {name && !nameValid && <div className="text-xs text-red-600 mt-1">Enter at least 2 characters</div>}
              </div>
              <div>
                <label className="text-sm text-neutral-600 dark:text-neutral-300">Email</label>
                <input type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} className={`w-full border rounded-md px-3 py-2 mt-1 ${email && !emailValid?'border-red-500':''}`} required />
                {email && !emailValid && <div className="text-xs text-red-600 mt-1">Enter a valid email</div>}
              </div>
              <div>
                <label className="text-sm text-neutral-600 dark:text-neutral-300">Password</label>
                <input type="password" placeholder="Minimum 6 characters" value={password} onChange={e=>setPassword(e.target.value)} className={`w-full border rounded-md px-3 py-2 mt-1 ${password && !passwordValid?'border-red-500':''}`} required />
                {password && !passwordValid && <div className="text-xs text-red-600 mt-1">Minimum 6 characters</div>}
              </div>
              <button disabled={loading || !formValid} className="w-full bg-blue-600 text-white rounded-md py-2 disabled:opacity-50">{loading?'Creating…':'Create account'}</button>
            </form>
            <div className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">Have an account? <Link to="/login" className="text-blue-600">Sign in</Link></div>
          </div>
        </div>
      </div>
    </div>
  )
}


