import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext.jsx'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export default function GoogleSignInButton({ onSuccess, onError, disabled }) {
  const { theme } = useTheme()
  const btnRef = useRef(null)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const [ready, setReady] = useState(false)

  onSuccessRef.current = onSuccess
  onErrorRef.current = onError

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return

    function tryInit() {
      if (!window.google?.accounts?.id) {
        setTimeout(tryInit, 200)
        return
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (response.credential) {
            onSuccessRef.current?.(response.credential)
          } else {
            onErrorRef.current?.('Google sign-in failed')
          }
        },
      })

      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          width: btnRef.current.offsetWidth || 320,
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
        })
      }
      setReady(true)
    }

    tryInit()
  }, [theme])

  if (!GOOGLE_CLIENT_ID) return null

  return (
    <div
      ref={btnRef}
      className={`w-full flex items-center justify-center ${disabled ? 'opacity-50 pointer-events-none' : ''} ${!ready ? 'min-h-[44px]' : ''}`}
    />
  )
}
