import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext.jsx'

export default function GoogleSignInButton({ onSuccess, onError, disabled }) {
  const btnRef = useRef(null)
  const { theme } = useTheme()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) return

    // Wait for the Google script to load
    function init() {
      if (!window.google?.accounts?.id) {
        setTimeout(init, 100)
        return
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) {
            onSuccess(response.credential)
          } else {
            onError?.('Google sign-in failed')
          }
        },
      })

      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          width: btnRef.current.offsetWidth,
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
        })
      }
      setReady(true)
    }

    init()
  }, [theme])

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) return null

  return (
    <div
      ref={btnRef}
      className={`w-full flex items-center justify-center ${disabled ? 'opacity-50 pointer-events-none' : ''} ${!ready ? 'min-h-[40px]' : ''}`}
    />
  )
}
