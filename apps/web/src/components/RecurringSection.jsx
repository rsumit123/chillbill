import { useEffect, useState, useCallback } from 'react'
import { api } from '../services/api.js'
import { useToast } from './Toast.jsx'

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return Number(amount).toFixed(2)
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function RecurringSection({ groupId, currency, accessToken, onRefresh }) {
  const [rules, setRules] = useState([])
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(null)
  const { push } = useToast()

  const load = useCallback(() => {
    api.get(`/groups/${groupId}/recurring-rules`, { token: accessToken })
      .then(r => setRules(r.rules || []))
      .catch(() => setRules([]))
  }, [groupId, accessToken])

  useEffect(() => { load() }, [load])

  async function pause(rule) {
    setBusy(rule.id)
    try {
      await api.post(`/groups/${groupId}/recurring-rules/${rule.id}/pause`, {}, { token: accessToken })
      load()
      push('Paused', 'success')
    } catch (e) {
      push(e.message || 'Failed to pause', 'error')
    } finally { setBusy(null) }
  }

  async function resume(rule) {
    setBusy(rule.id)
    try {
      await api.post(`/groups/${groupId}/recurring-rules/${rule.id}/resume`, {}, { token: accessToken })
      load()
      push('Resumed', 'success')
    } catch (e) {
      push(e.message || 'Failed to resume', 'error')
    } finally { setBusy(null) }
  }

  async function remove(rule) {
    if (!confirm('Delete this recurring rule? Past expenses are not affected.')) return
    setBusy(rule.id)
    try {
      await api.del(`/groups/${groupId}/recurring-rules/${rule.id}`, { token: accessToken })
      load()
      push('Deleted', 'success')
      onRefresh?.()
    } catch (e) {
      push(e.message || 'Failed to delete', 'error')
    } finally { setBusy(null) }
  }

  if (rules.length === 0) return null

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 p-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Recurring bills ({rules.length})
        </span>
        <svg className={`ml-auto w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
          {rules.map(r => (
            <div key={r.id} className="p-4 flex items-start gap-3">
              <div className="text-2xl leading-none">{r.is_active ? '🔁' : '⏸'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <div className="font-medium truncate">{r.note || '(no note)'}</div>
                  <div className="text-sm text-neutral-500 dark:text-neutral-400 ml-auto">
                    {fmt(r.total_amount, r.currency || currency)}
                  </div>
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {ordinal(r.day_of_month)} of every month · {r.splits.length} way split
                </div>
                {!r.is_active && r.paused_reason && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Paused: {r.paused_reason}
                  </div>
                )}
                <div className="mt-2 flex gap-3 text-xs">
                  {r.is_active ? (
                    <button className="text-blue-600 hover:underline disabled:opacity-50" disabled={busy === r.id} onClick={() => pause(r)}>Pause</button>
                  ) : (
                    <button className="text-blue-600 hover:underline disabled:opacity-50" disabled={busy === r.id} onClick={() => resume(r)}>Resume</button>
                  )}
                  <button className="text-red-600 hover:underline disabled:opacity-50" disabled={busy === r.id} onClick={() => remove(r)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
