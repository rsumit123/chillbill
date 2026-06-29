import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { api } from '../services/api.js'
import { useToast } from './Toast.jsx'
import { ButtonSpinner } from './Spinner.jsx'

export default function EditExpenseModal({ open, onClose, expenseId, group, accessToken, onUpdated }) {
  const { push } = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [paidByMemberId, setPaidByMemberId] = useState(null)
  const [mode, setMode] = useState('equal')
  const [selectedMembers, setSelectedMembers] = useState(new Set())
  const [splits, setSplits] = useState([])

  const currency = group?.currency || 'INR'
  const members = group?.members || []

  // Load the original expense when modal opens, seed all the state.
  useEffect(() => {
    if (!open || !expenseId || !group) return
    let cancelled = false
    setLoading(true)
    setError('')
    api.get(`/groups/expenses/${expenseId}`, { token: accessToken })
      .then(e => {
        if (cancelled) return
        setNote(e.note || '')
        setAmount(String(e.total_amount))
        setPaidByMemberId(e.paid_by_member_id)
        // Determine original mode: if any split has share_percentage, mode = percent; else amount.
        // Equal is harder to detect; default to 'amount' for safety on edit.
        const hasPercent = (e.splits || []).some(s => s.share_percentage != null && Number(s.share_percentage) > 0)
        setMode(hasPercent ? 'percent' : 'amount')
        const origSelected = new Set((e.splits || []).map(s => s.member_id))
        setSelectedMembers(origSelected)
        // Seed splits row for EVERY current group member (so new members are toggleable),
        // with original values where present and zero otherwise.
        const origById = new Map((e.splits || []).map(s => [s.member_id, s]))
        const rows = members.map(m => {
          const orig = origById.get(m.member_id)
          return {
            member_id: m.member_id,
            share_amount: orig ? Number(orig.share_amount) : 0,
            share_percentage: orig ? Number(orig.share_percentage || 0) : 0,
          }
        })
        setSplits(rows)
      })
      .catch(err => { if (!cancelled) setError(err?.message || 'Failed to load expense') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, expenseId, group, accessToken])

  // Recompute equal splits when mode is "equal" or amount/selection changes.
  useEffect(() => {
    if (mode !== 'equal') return
    const total = Number(amount) || 0
    const selectedCount = selectedMembers.size
    if (selectedCount === 0) {
      setSplits(prev => prev.map(s => ({ ...s, share_amount: 0, share_percentage: 0 })))
      return
    }
    const per = +(total / selectedCount).toFixed(2)
    setSplits(prev => prev.map(s => ({
      ...s,
      share_amount: selectedMembers.has(s.member_id) ? per : 0,
      share_percentage: selectedMembers.has(s.member_id) ? +(100 / selectedCount).toFixed(2) : 0,
    })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, mode, selectedMembers])

  function toggleMember(mid) {
    setSelectedMembers(prev => {
      const next = new Set(prev)
      if (next.has(mid)) next.delete(mid); else next.add(mid)
      return next
    })
  }

  function updateSplitAmount(mid, value) {
    const num = Number(value || 0)
    setSplits(prev => prev.map(s => s.member_id === mid ? { ...s, share_amount: num } : s))
  }

  function updateSplitPercent(mid, value) {
    const num = Number(value || 0)
    setSplits(prev => prev.map(s => s.member_id === mid ? { ...s, share_percentage: num } : s))
  }

  async function save() {
    const total = Number(amount)
    if (!total || total <= 0) { setError('Enter an amount greater than 0'); return }
    if (!paidByMemberId) { setError('Pick who paid'); return }
    if (selectedMembers.size === 0) { setError('Pick at least one member to split with'); return }
    setError('')
    let outSplits
    if (mode === 'percent') {
      outSplits = splits
        .filter(s => selectedMembers.has(s.member_id))
        .map(s => ({
          member_id: s.member_id,
          share_amount: +(total * (Number(s.share_percentage || 0) / 100)).toFixed(2),
          share_percentage: Number(s.share_percentage || 0),
        }))
    } else {
      outSplits = splits
        .filter(s => selectedMembers.has(s.member_id) && s.share_amount > 0)
        .map(s => ({
          member_id: s.member_id,
          share_amount: Number(s.share_amount || 0),
          share_percentage: null,
        }))
    }
    if (outSplits.length === 0) {
      setError('Splits must include at least one selected member with a non-zero share')
      return
    }
    const payload = {
      total_amount: total,
      currency,
      note: note || null,
      date: new Date().toISOString(),
      paid_by_member_id: paidByMemberId,
      splits: outSplits,
    }
    setLoading(true)
    try {
      await api.put(`/groups/expenses/${expenseId}`, payload, { token: accessToken })
      push('Expense updated', 'success')
      onUpdated?.()
      onClose?.()
    } catch (err) {
      const msg = err?.message || 'Failed to update expense'
      setError(msg)
      push(msg, 'error')
    } finally { setLoading(false) }
  }

  if (!open) return null
  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6">
        <div className="text-xl font-semibold mb-4">Edit expense</div>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Note</label>
            <input
              className="mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2"
              placeholder="What was this for?"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Amount ({currency})</label>
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Paid by</label>
            <select
              className="mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2"
              value={paidByMemberId || ''}
              onChange={e => setPaidByMemberId(Number(e.target.value))}
            >
              {members.map(m => (
                <option key={m.member_id} value={m.member_id}>{m.name || m.email}{m.is_ghost ? ' (offline)' : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Split with</label>
            <div className="mt-1 border dark:border-neutral-700 rounded-md p-2 max-h-40 overflow-y-auto">
              {members.map(m => (
                <label key={m.member_id} className="flex items-center gap-2 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 p-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={selectedMembers.has(m.member_id)}
                    onChange={() => toggleMember(m.member_id)}
                  />
                  <span className="text-sm">{m.name || m.email}{m.is_ghost ? ' (offline)' : ''}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Split mode</label>
            <div className="mt-1 inline-flex rounded-md border dark:border-neutral-700 overflow-hidden">
              <button type="button" onClick={() => setMode('equal')} className={`px-3 py-1 ${mode === 'equal' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-neutral-800'}`}>Equal</button>
              <button type="button" onClick={() => setMode('amount')} className={`px-3 py-1 ${mode === 'amount' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-neutral-800'}`}>Amount</button>
              <button type="button" onClick={() => setMode('percent')} className={`px-3 py-1 ${mode === 'percent' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-neutral-800'}`}>%</button>
            </div>
          </div>

          {mode !== 'equal' && (
            <div className="space-y-2">
              {splits.filter(s => selectedMembers.has(s.member_id)).map(s => {
                const m = members.find(x => x.member_id === s.member_id)
                return (
                  <div key={s.member_id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{m?.name || m?.email}</span>
                    {mode === 'percent' ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          className="w-20 border dark:border-neutral-700 dark:bg-neutral-800 rounded px-2 py-1"
                          value={s.share_percentage || ''}
                          onChange={e => updateSplitPercent(s.member_id, e.target.value)}
                        />
                        <span>%</span>
                      </div>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        className="w-24 border dark:border-neutral-700 dark:bg-neutral-800 rounded px-2 py-1"
                        value={s.share_amount || ''}
                        onChange={e => updateSplitAmount(s.member_id, e.target.value)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {mode === 'percent' && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Total {splits.filter(s => selectedMembers.has(s.member_id)).reduce((a, s) => a + Number(s.share_percentage || 0), 0).toFixed(2)}%
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button className="text-neutral-600 dark:text-neutral-300 px-4 py-2" onClick={onClose}>Cancel</button>
          <button
            className="bg-blue-600 text-white rounded-md px-6 py-2 flex items-center gap-2 disabled:opacity-50"
            disabled={loading}
            onClick={save}
          >
            {loading && <ButtonSpinner />}
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
