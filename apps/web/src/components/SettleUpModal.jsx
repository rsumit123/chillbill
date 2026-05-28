import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { Avatar } from './Avatar.jsx'
import { Spinner, ButtonSpinner } from './Spinner.jsx'
import { api } from '../services/api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from './Toast.jsx'

function fmt(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount) }
  catch { return Number(amount).toFixed(2) }
}

export default function SettleUpModal({ open, onClose, group, onSettled }) {
  const { accessToken } = useAuth()
  const { push } = useToast()
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [pendingId, setPendingId] = useState(null)

  useEffect(() => {
    if (!open || !group) return
    let mounted = true
    setLoading(true)
    api.get(`/groups/${group.id}/settlements/suggestions`, { token: accessToken })
      .then(s => { if (mounted) setSuggestions(s || []) })
      .catch(err => push(err.message || 'Failed to load suggestions', 'error'))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [open, group?.id])

  function memberById(id) {
    return group?.members?.find(m => m.member_id === id)
  }

  async function settleOne(s, idx) {
    setPendingId(idx)
    try {
      await api.post(`/groups/${group.id}/settlements`, {
        from_member_id: s.from_member_id,
        to_member_id: s.to_member_id,
        amount: s.amount,
      }, { token: accessToken })
      push('Settlement recorded', 'success')
      // Optimistically drop this row; parent will refetch full balances.
      setSuggestions(prev => prev.filter((_, i) => i !== idx))
      onSettled?.()
    } catch (err) {
      push(err.message || 'Failed to record settlement', 'error')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Settle up</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
          The fewest payments to zero everyone out. Tap <span className="font-medium">Mark as paid</span> when the money has actually moved.
        </p>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" className="text-blue-600" /></div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-2">🎉</div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Everyone is settled up.</div>
          </div>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((s, idx) => {
              const from = memberById(s.from_member_id)
              const to = memberById(s.to_member_id)
              const fromName = from?.name || `Member ${s.from_member_id}`
              const toName = to?.name || `Member ${s.to_member_id}`
              const isPending = pendingId === idx
              return (
                <li key={idx} className="border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar name={fromName} size={26} ghost={from?.is_ghost} />
                    <div className="text-sm text-neutral-900 dark:text-neutral-100 truncate">
                      <span className="font-medium">{fromName}</span>
                      <span className="text-neutral-400 mx-1">→</span>
                      <span className="font-medium">{toName}</span>
                    </div>
                    <Avatar name={toName} size={26} ghost={to?.is_ghost} />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {fmt(s.amount, group.currency)}
                    </div>
                    <button
                      type="button"
                      onClick={() => settleOne(s, idx)}
                      disabled={isPending || pendingId !== null}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-1.5"
                    >
                      {isPending && <ButtonSpinner />}
                      {isPending ? 'Saving…' : 'Mark as paid'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="text-neutral-600 dark:text-neutral-300 px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    </Modal>
  )
}
