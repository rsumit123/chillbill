import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { api } from '../services/api.js'

export default function EditExpenseModal({ open, onClose, expenseId, accessToken, currency, onUpdated }) {
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
      splits: orig.splits.map(s => ({ user_id: s.user_id, share_amount: +(Number(s.share_amount) * ratio).toFixed(2), share_percentage: s.share_percentage ?? null })),
    }
    setLoading(true)
    try {
      await api.put(`/groups/expenses/${expenseId}`, payload, { token: accessToken })
      onUpdated?.()
      onClose?.()
    } catch (err) {
      setError(err.message || 'Failed to save')
    } finally { setLoading(false) }
  }

  if (!open) return null
  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-4 sm:p-6">
        <div className="text-lg font-semibold mb-2">Edit expense</div>
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        <div className="space-y-2">
          <input className="w-full border rounded-md px-3 py-2" placeholder="Note" value={note} onChange={e=>setNote(e.target.value)} />
          <input className="w-full border rounded-md px-3 py-2" placeholder={`Amount (${currency})`} value={amount} onChange={e=>setAmount(e.target.value)} />
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          <button className="text-neutral-600" onClick={onClose}>Cancel</button>
          <button className="bg-blue-600 text-white rounded-md px-4 py-2" disabled={loading} onClick={save}>{loading?'Saving…':'Save'}</button>
        </div>
      </div>
    </Modal>
  )
}


