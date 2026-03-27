import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { Spinner } from '../components/Spinner.jsx'

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const { googleLogin } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    const err = searchParams.get('error')

    if (err) {
      setError(err)
      setTimeout(() => navigate('/login'), 2000)
      return
    }

    if (!code) {
      navigate('/login')
      return
    }

    async function exchange() {
      try {
        await googleLogin(code)
        push('Signed in successfully', 'success')
        navigate('/dashboard')
      } catch (e) {
        setError(e.message || 'Sign-in failed')
        setTimeout(() => navigate('/login'), 2000)
      }
    }

    exchange()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-neutral-900 dark:to-neutral-950 flex items-center justify-center">
      <div className="text-center">
        {error ? (
          <div className="text-red-600 dark:text-red-400">{error}</div>
        ) : (
          <>
            <Spinner size="lg" className="text-blue-600 mx-auto mb-3" />
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Signing you in...</div>
          </>
        )}
      </div>
    </div>
  )
}
