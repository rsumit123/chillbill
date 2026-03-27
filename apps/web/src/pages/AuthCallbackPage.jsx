import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { Spinner } from '../components/Spinner.jsx'

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const { setAuthData } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')
    const userJson = searchParams.get('user')
    const err = searchParams.get('error')

    if (err) {
      setError(err)
      setTimeout(() => navigate('/login'), 2000)
      return
    }

    if (!accessToken || !userJson) {
      navigate('/login')
      return
    }

    try {
      const user = JSON.parse(userJson)
      setAuthData(user, { access_token: accessToken, refresh_token: refreshToken, token_type: 'bearer' })
      push('Signed in successfully', 'success')
      navigate('/dashboard')
    } catch {
      setError('Failed to process sign-in data')
      setTimeout(() => navigate('/login'), 2000)
    }
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
