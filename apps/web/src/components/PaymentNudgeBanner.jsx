import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

const KEY = 'cb_payment_nudge_dismissed'

export default function PaymentNudgeBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })

  const hasMethod = (user?.payment_methods || []).length > 0
  if (dismissed || hasMethod) return null

  function dismiss() {
    try { localStorage.setItem(KEY, '1') } catch { /* noop */ }
    setDismissed(true)
  }

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 mb-4 flex items-center gap-3">
      <div className="text-xl">💳</div>
      <div className="flex-1 text-sm text-blue-900 dark:text-blue-200">
        Add a payment method so friends can pay you in one tap.{' '}
        <Link to="/dashboard/settings" className="font-medium underline">Add now →</Link>
      </div>
      <button onClick={dismiss} className="text-blue-600 dark:text-blue-400 px-2" aria-label="Dismiss">×</button>
    </div>
  )
}
