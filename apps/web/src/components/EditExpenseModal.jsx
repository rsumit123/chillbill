import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { api } from '../services/api.js'
import { useToast } from './Toast.jsx'

export default function EditExpenseModal({ open, onClose, expenseId, accessToken, currency, onUpdated }) {
  const { push } = useToast()
  const [loading, setLoading] = useState(false)
  const [orig, setOrig] = useState(null)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      if (!open || !expenseId) return
      setLoading(true)
      try {
        const e = await api.get(`/groups/expenses/${expenseId}`, { token: accessToken })
        setOrig(e)
        setNote(e.note || '')
        setAmount(String(e.total_amount))
      } catch (err) {
        setError(err.message || 'Failed to load expense')
      } finally { setLoading(false) }
    }
    load()
  }, [open, expenseId, accessToken])

  async function save() {
    const newAmt = Number(amount)
    if (!newAmt || newAmt <= 0) { setError('Enter an amount greater than 0'); return }
    setError('')
    const ratio = orig.total_amount ? newAmt / Number(orig.total_amount) : 1
    const payload = {
      total_amount: newAmt,
      currency: currency,
      note: note || null,
      date: orig.date,
      splits: orig.splits.map(s => ({ member_id: s.member_id, share_amount: +(Number(s.share_amount) * ratio).toFixed(2), share_percentage: s.share_percentage ?? null })),
    }
    setLoading(true)
    try {
      await api.put(`/groups/expenses/${expenseId}`, payload, { token: accessToken })
      push('Expense updated successfully', 'success')
      onUpdated?.()
      onClose?.()
    } catch (err) {
      setError(err.message || 'Failed to save')
      push(err.message || 'Failed to update expense', 'error')
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
              onChange={e=>setNote(e.target.value)} 
            />
          </div>
          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Amount ({currency})</label>
            <input 
              className="mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2" 
              placeholder="0.00" 
              type="number" 
              step="0.01" 
              value={amount} 
              onChange={e=>setAmount(e.target.value)} 
            />
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button className="text-neutral-600 dark:text-neutral-300 px-4 py-2" onClick={onClose}>Cancel</button>
          <button className="bg-blue-600 text-white rounded-md px-6 py-2" disabled={loading} onClick={save}>{loading?'Saving…':'Save'}</button>
        </div>
      </div>
    </Modal>
  )
}


