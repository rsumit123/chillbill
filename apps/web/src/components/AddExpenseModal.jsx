import { useState, useEffect } from 'react'
import Modal from './Modal.jsx'
import { ButtonSpinner } from './Spinner.jsx'
import { Avatar } from './Avatar.jsx'

export default function AddExpenseModal({ open, onClose, group, user, onSubmit, submitting }) {
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [paidByMemberId, setPaidByMemberId] = useState(null)
  const [splits, setSplits] = useState([])
  const [mode, setMode] = useState('equal')
  const [amountError, setAmountError] = useState('')

  // Initialize when modal opens
  useEffect(() => {
    if (open && group) {
      const currentMember = group.members.find(m => m.user_id === user?.id)
      setPaidByMemberId(currentMember?.member_id || group.members[0]?.member_id || null)
      const per = group.members.length ? 0 : 0
      setSplits(group.members.map(m => ({ 
        user_id: m.user_id, 
        share_amount: per, 
        name: m.name || m.user_id, 
        is_ghost: m.is_ghost, 
        member_id: m.member_id,
        share_percentage: 0
      })))
    }
  }, [open, group, user])

  // Auto-calculate equal splits when amount or mode changes
  const total = Number(amount || 0)
  useEffect(() => {
    if (mode === 'equal' && group) {
      const n = Math.max(group.members.length, 1)
      const per = n ? +(total / n).toFixed(2) : 0
      setSplits(group.members.map(m => ({ 
        user_id: m.user_id, 
        name: m.name || m.user_id, 
        share_amount: per, 
        is_ghost: m.is_ghost, 
        member_id: m.member_id,
        share_percentage: 0
      })))
    }
  }, [total, mode, group?.members?.length])

  function updateSplit(memberId, value) {
    const val = Number(value || 0)
    setSplits(prev => prev.map(s => s.member_id === memberId ? { ...s, share_amount: val } : s))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!total || total <= 0) {
      setAmountError('Enter an amount greater than 0')
      return
    }
    setAmountError('')
    onSubmit({ note, amount, paidByMemberId, splits, mode })
    // Reset form
    setNote('')
    setAmount('')
    setAmountError('')
  }

  function handleClose() {
    setNote('')
    setAmount('')
    setAmountError('')
    onClose()
  }

  if (!open || !group) return null

  return (
    <Modal open={open} onClose={handleClose}>
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Add Expense</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Expense name</label>
            <input 
              className="mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2" 
              placeholder="Dinner, groceries, taxi..." 
              value={note} 
              onChange={e=>setNote(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Amount ({group.currency})</label>
            <input 
              className={`mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2 ${amountError?'border-red-500':''}`}
              placeholder="0.00" 
              type="number"
              step="0.01"
              value={amount} 
              onChange={e=>setAmount(e.target.value)}
            />
            {amountError && <div className="text-xs text-red-600 mt-1">{amountError}</div>}
          </div>

          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Paid by</label>
            <select 
              className="mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2" 
              value={paidByMemberId || ''} 
              onChange={e=>setPaidByMemberId(Number(e.target.value))}
            >
              {group.members.map(m => (
                <option key={m.member_id} value={m.member_id}>
                  {m.name || m.user_id}{m.is_ghost?' (offline)':''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-neutral-700 dark:text-neutral-300">Split</label>
              <div className="inline-flex rounded-md border dark:border-neutral-700 overflow-hidden text-xs">
                <button type="button" onClick={()=>setMode('equal')} className={`px-3 py-1 ${mode==='equal'?'bg-blue-600 text-white':'bg-white dark:bg-neutral-800'}`}>Equal</button>
                <button type="button" onClick={()=>setMode('amount')} className={`px-3 py-1 ${mode==='amount'?'bg-blue-600 text-white':'bg-white dark:bg-neutral-800'}`}>Amount</button>
                <button type="button" onClick={()=>setMode('percent')} className={`px-3 py-1 ${mode==='percent'?'bg-blue-600 text-white':'bg-white dark:bg-neutral-800'}`}>%</button>
              </div>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {splits.map(s => (
                <div key={s.member_id} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 text-neutral-700 dark:text-neutral-300">{s.name}{s.is_ghost?' 📴':''}</div>
                  {mode==='percent' ? (
                    <div className="flex items-center gap-1">
                      <input 
                        className="w-20 border dark:border-neutral-700 dark:bg-neutral-800 rounded px-2 py-1 text-sm" 
                        type="number"
                        value={s.share_percentage||''} 
                        onChange={e=>setSplits(prev=>prev.map(x=>x.member_id===s.member_id?{...x, share_percentage:Number(e.target.value||0)}:x))} 
                      />
                      <span className="text-neutral-500">%</span>
                    </div>
                  ) : (
                    <input 
                      className="w-24 border dark:border-neutral-700 dark:bg-neutral-800 rounded px-2 py-1 text-sm" 
                      type="number"
                      step="0.01"
                      value={s.share_amount} 
                      onChange={e=>updateSplit(s.member_id, e.target.value)} 
                    />
                  )}
                </div>
              ))}
            </div>
            {mode==='percent' && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">Percentages should sum to 100</div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button type="button" className="text-neutral-600 dark:text-neutral-300 px-4 py-2" onClick={handleClose}>Cancel</button>
            <button 
              type="submit" 
              disabled={submitting} 
              className="bg-blue-600 text-white rounded-md px-6 py-2 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <ButtonSpinner />}
              {submitting ? 'Adding...' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

