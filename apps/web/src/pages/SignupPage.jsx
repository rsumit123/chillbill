import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function SignupPage() {
  const { signup } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signup(name, email, password)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Signup failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white/70 backdrop-blur border rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-4">Create your account</h1>
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
        <form onSubmit={onSubmit} className="space-y-3">
          <input type="text" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} className="w-full border rounded-md px-3 py-2" required />
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full border rounded-md px-3 py-2" required />
          <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full border rounded-md px-3 py-2" required />
          <button disabled={loading} className="w-full bg-blue-600 text-white rounded-md py-2 disabled:opacity-50">{loading?'Creating...':'Create account'}</button>
        </form>
        <div className="mt-3 text-sm text-neutral-600">Have an account? <Link to="/login" className="text-blue-600">Sign in</Link></div>
      </div>
    </div>
  )
}


