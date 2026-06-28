import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../components/Toast.jsx'
import { api } from '../services/api.js'
import PaymentMethodsEditor from '../components/PaymentMethodsEditor.jsx'
import { Spinner } from '../components/Spinner.jsx'

export default function SettingsPage() {
  const { user, accessToken, updatePaymentMethods } = useAuth()
  const { push } = useToast()
  const [methods, setMethods] = useState(user?.payment_methods || [])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    api.get('/me', { token: accessToken })
      .then(me => { if (mounted) { setMethods(me.payment_methods || []); updatePaymentMethods(me.payment_methods || []) } })
      .catch(err => push(err.message || 'Failed to load profile', 'error'))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [accessToken])

  async function save(newMethods) {
    setSaving(true)
    try {
      const res = await api.put('/me/payment-methods', { payment_methods: newMethods }, { token: accessToken })
      updatePaymentMethods(res.payment_methods)
      setMethods(res.payment_methods)
      push('Payment methods saved', 'success')
    } catch (err) {
      push(err.message || 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl space-y-8 pb-12">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Settings</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Your account and payment preferences.</p>
      </header>

      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
        <h2 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Profile</h2>
        <div className="text-sm text-neutral-600 dark:text-neutral-400">{user?.name}</div>
        <div className="text-sm text-neutral-500 dark:text-neutral-500">{user?.email}</div>
      </section>

      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
        <h2 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Payment methods</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          Add the ways your friends can pay you. We'll show one-tap buttons in the settle-up flow.
          Only members of your shared groups can see these.
        </p>
        {loading ? (
          <Spinner size="md" className="text-blue-600" />
        ) : (
          <PaymentMethodsEditor initial={methods} onSave={save} saving={saving} />
        )}
      </section>
    </div>
  )
}
