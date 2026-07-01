import { useState, useEffect, useRef } from 'react'
import Modal from './Modal.jsx'
import { ButtonSpinner } from './Spinner.jsx'
import { Avatar } from './Avatar.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { api } from '../services/api.js'
import { useToast } from './Toast.jsx'
import { pickReceiptFile, scanReceipt, captureReceipt } from '../services/receipt.js'
import ReceiptSplitModal from './ReceiptSplitModal.jsx'
import { Capacitor } from '@capacitor/core'

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function AddExpenseModal({ open, onClose, group, user, onSubmit, submitting, onSwitchToSettlement }) {
  const { accessToken } = useAuth()
  const { push } = useToast()
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const fileInputRef = useRef(null)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [repeat, setRepeat] = useState(false)
  const [paidByMemberId, setPaidByMemberId] = useState(null)
  const [splits, setSplits] = useState([])
  const [selectedMembers, setSelectedMembers] = useState(new Set())
  const [mode, setMode] = useState('equal')
  const [amountError, setAmountError] = useState('')
  const [nlText, setNlText] = useState('')
  const [nlState, setNlState] = useState('idle') // idle | loading | parsed | unknown
  const [nlError, setNlError] = useState('')
  const [preParseSnapshot, setPreParseSnapshot] = useState(null)
  const [parsedSummary, setParsedSummary] = useState(null)

  // Initialize when modal opens - select all members by default
  useEffect(() => {
    if (open && group && group.members && group.members.length > 0) {
      const currentMember = group.members.find(m => m.user_id === user?.id)
      setPaidByMemberId(currentMember?.member_id || group.members[0]?.member_id || null)
      
      // Select all members by default
      setSelectedMembers(new Set(group.members.map(m => m.member_id)))
      
      const per = 0
      setSplits(group.members.map(m => ({ 
        user_id: m.user_id, 
        share_amount: per, 
        name: m.name || m.user_id, 
        is_ghost: m.is_ghost, 
        member_id: m.member_id,
        share_percentage: 0
      })))
    }
  }, [open, group?.members?.length, user?.id])

  // Auto-calculate equal splits when amount, mode, or selected members change
  const total = Number(amount || 0)
  useEffect(() => {
    if (mode === 'equal' && group && group.members && group.members.length > 0 && open) {
      const selectedCount = selectedMembers.size
      const per = selectedCount > 0 ? +(total / selectedCount).toFixed(2) : 0
      
      setSplits(group.members.map(m => ({ 
        user_id: m.user_id, 
        name: m.name || m.user_id, 
        share_amount: selectedMembers.has(m.member_id) ? per : 0,
        is_ghost: m.is_ghost, 
        member_id: m.member_id,
        share_percentage: selectedMembers.has(m.member_id) ? (100 / selectedCount) : 0
      })))
    }
  }, [total, mode, selectedMembers.size, group?.members?.length, open])

  async function handleParse() {
    const text = nlText.trim()
    if (!text) return
    setNlState('loading')
    setNlError('')
    try {
      const res = await api.post(`/groups/${group.id}/expenses/parse`, { text }, { token: accessToken })
      if (res.intent === 'settlement') {
        const ok = window.confirm(
          `This looks like a settlement (paying someone back), not a shared expense. Switch to the settle-up flow?`
        )
        if (ok) {
          onClose?.()
          onSwitchToSettlement?.(res.settlement)
        }
        setNlState('idle')
        return
      }
      if (res.intent !== 'expense' || !res.expense) {
        setNlState('unknown')
        setNlError(res.error || "Couldn't understand that — try rephrasing, or fill the form below")
        return
      }
      // Snapshot existing form state for Undo
      setPreParseSnapshot({ note, amount, paidByMemberId, splits, mode, selectedMembers: new Set(selectedMembers) })
      // Apply parsed values to form
      const e = res.expense
      setNote(e.note || '')
      setAmount(String(e.total_amount))
      setPaidByMemberId(e.paid_by_member_id)
      setMode(e.split_mode || 'equal')
      setSelectedMembers(new Set(e.splits.map(s => s.member_id)))
      setSplits(e.splits.map(s => ({ member_id: s.member_id, share_amount: s.share_amount, share_percentage: 0 })))
      setParsedSummary(`Parsed from "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`)
      setNlState('parsed')
    } catch (err) {
      setNlState('unknown')
      setNlError(err?.message || "Couldn't reach the parser. Fill the form below.")
    }
  }

  function undoParse() {
    if (!preParseSnapshot) return
    setNote(preParseSnapshot.note)
    setAmount(preParseSnapshot.amount)
    setPaidByMemberId(preParseSnapshot.paidByMemberId)
    setSplits(preParseSnapshot.splits)
    setMode(preParseSnapshot.mode)
    setSelectedMembers(preParseSnapshot.selectedMembers)
    setPreParseSnapshot(null)
    setParsedSummary(null)
    setNlState('idle')
  }

  function toggleMember(memberId) {
    setSelectedMembers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(memberId)) {
        if (newSet.size > 1) { // Must have at least one member selected
          newSet.delete(memberId)
        }
      } else {
        newSet.add(memberId)
      }
      return newSet
    })
  }

  function updateSplit(memberId, value) {
    const val = Number(value || 0)
    setSplits(prev => prev.map(s => s.member_id === memberId ? { ...s, share_amount: val } : s))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!total || total <= 0) {
      setAmountError('Enter an amount greater than 0')
      return
    }
    if (selectedMembers.size === 0) {
      setAmountError('Select at least one member')
      return
    }
    setAmountError('')

    // Only send splits for selected members
    const filteredSplits = mode === 'percent'
      ? splits.filter(s => selectedMembers.has(s.member_id))
      : splits.filter(s => selectedMembers.has(s.member_id) && s.share_amount > 0)

    const dayOfMonth = new Date(date).getDate() || new Date().getDate()
    const primary = onSubmit({ note, amount, paidByMemberId, splits: filteredSplits, mode })
    const secondary = repeat
      ? api.post(`/groups/${group.id}/recurring-rules`, {
          paid_by_member_id: paidByMemberId,
          total_amount: total,
          currency: group.currency,
          note: note || null,
          splits: filteredSplits.map(s => ({ member_id: s.member_id, share_amount: Number(s.share_amount || 0), share_percentage: null })),
          day_of_month: dayOfMonth,
          start_from_next_month: true,
        }, { token: accessToken })
      : Promise.resolve(null)
    await Promise.all([primary, secondary])
    // Reset form
    setNote('')
    setAmount('')
    setAmountError('')
  }

  function handleClose() {
    setNote('')
    setAmount('')
    setAmountError('')
    setRepeat(false)
    setNlText('')
    setNlState('idle')
    setNlError('')
    setPreParseSnapshot(null)
    setParsedSummary(null)
    onClose()
  }

  if (!open) return null
  if (!group || !group.members || group.members.length === 0) {
    return (
      <Modal open={open} onClose={handleClose}>
        <div className="p-6 text-center">
          <div className="text-neutral-600 dark:text-neutral-400">Loading...</div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Add Expense</h2>

        <div className="mb-3">
          <button
            type="button"
            onClick={async () => {
              if (Capacitor.isNativePlatform()) {
                try {
                  setScanning(true)
                  const blob = await captureReceipt()
                  const parsed = await scanReceipt(group.id, blob, accessToken)
                  setScanResult(parsed)
                } catch (e) {
                  push(e?.message || 'Scan failed', 'error')
                } finally { setScanning(false) }
              } else {
                fileInputRef.current?.click()
              }
            }}
            disabled={scanning}
            className="text-sm px-3 py-1.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-200 disabled:opacity-50"
          >
            {scanning ? 'Scanning…' : '📷 Scan receipt'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async e => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                setScanning(true)
                const blob = await pickReceiptFile(f)
                const parsed = await scanReceipt(group.id, blob, accessToken)
                setScanResult(parsed)
              } catch (err) {
                push(err?.message || 'Scan failed', 'error')
              } finally {
                setScanning(false)
                e.target.value = ''
              }
            }}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Natural Language Section */}
          <div className="space-y-3 mb-5">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
              <span>✨</span> Describe it (or fill out below)
            </label>
            <textarea
              value={nlText}
              onChange={e => setNlText(e.target.value)}
              placeholder='e.g. "I paid 1200 for dinner with Aarav and Priya"'
              rows={2}
              className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-800 resize-y"
              disabled={nlState === 'loading'}
            />
            <div className="flex items-center justify-between">
              <div className="text-xs text-neutral-500 dark:text-neutral-500">
                💡 Try: "Cab to airport 800 split 3 ways"
              </div>
              <button
                type="button"
                onClick={handleParse}
                disabled={nlState === 'loading' || !nlText.trim()}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {nlState === 'loading' ? 'Reading…' : 'Read it →'}
              </button>
            </div>
            {nlState === 'unknown' && (
              <div className="text-xs text-red-600 dark:text-red-400">{nlError}</div>
            )}
            {nlState === 'parsed' && parsedSummary && (
              <div className="text-xs flex items-center gap-2 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 rounded-lg px-2 py-1.5">
                <span>{parsedSummary}</span>
                <button type="button" onClick={undoParse} className="underline">Undo</button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
            <span className="text-xs text-neutral-400">or fill manually</span>
            <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
          </div>

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
              {group && group.members && group.members.map(m => (
                <option key={m.member_id} value={m.member_id}>
                  {m.name || m.user_id}{m.is_ghost?' (offline)':''}
                </option>
              ))}
            </select>
          </div>

          {/* Split with - Member Selection */}
          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300 mb-2 block">Split with</label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto p-2 border dark:border-neutral-700 rounded-md bg-neutral-50 dark:bg-neutral-800/50">
              {group && group.members && group.members.map(m => (
                <label key={m.member_id} className="flex items-center gap-2 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 p-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={selectedMembers.has(m.member_id)}
                    onChange={() => toggleMember(m.member_id)}
                    className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600"
                  />
                  <Avatar name={m.name || m.user_id} size={18} ghost={m.is_ghost} />
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    {m.name || m.user_id}{m.is_ghost?' (offline)':''}
                  </span>
                </label>
              ))}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {selectedMembers.size} of {group?.members?.length || 0} members selected
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-neutral-700 dark:text-neutral-300">Split mode</label>
              <div className="inline-flex rounded-md border dark:border-neutral-700 overflow-hidden text-xs">
                <button type="button" onClick={()=>setMode('equal')} className={`px-3 py-1 ${mode==='equal'?'bg-blue-600 text-white':'bg-white dark:bg-neutral-800'}`}>Equal</button>
                <button type="button" onClick={()=>setMode('amount')} className={`px-3 py-1 ${mode==='amount'?'bg-blue-600 text-white':'bg-white dark:bg-neutral-800'}`}>Amount</button>
                <button type="button" onClick={()=>setMode('percent')} className={`px-3 py-1 ${mode==='percent'?'bg-blue-600 text-white':'bg-white dark:bg-neutral-800'}`}>%</button>
              </div>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {splits && splits.length > 0 ? splits.filter(s => selectedMembers.has(s.member_id)).map(s => (
                <div key={s.member_id} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                    <Avatar name={s.name} size={18} ghost={s.is_ghost} />
                    <span>{s.name}</span>
                  </div>
                  {mode==='percent' ? (
                    <div className="flex items-center gap-1">
                      <input 
                        className="w-20 border dark:border-neutral-700 dark:bg-neutral-800 rounded px-2 py-1 text-sm" 
                        type="number"
                        value={s.share_percentage||''} 
                        onChange={e=>setSplits(prev=>prev.map(x=>x.member_id===s.member_id?{...x, share_percentage:Number(e.target.value||0)}:x))} 
                      />
                      <span className="text-neutral-500 dark:text-neutral-400">%</span>
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
              )) : (
                <div className="text-sm text-neutral-500 dark:text-neutral-400">Select members to split with</div>
              )}
            </div>
            {mode==='percent' && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">Percentages should sum to 100</div>
            )}
          </div>

          <label className="flex items-start gap-2 cursor-pointer mt-4">
            <input
              type="checkbox"
              className="mt-1"
              checked={repeat}
              onChange={e => setRepeat(e.target.checked)}
            />
            <div>
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Repeat monthly</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Also add this on the {ordinal(new Date(date || undefined).getDate())} of every month automatically.
              </div>
            </div>
          </label>

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

      {scanResult && (
        <ReceiptSplitModal
          open={true}
          parsed={scanResult}
          group={group}
          onSubmit={onSubmit}
          onClose={() => setScanResult(null)}
          onCreated={() => {
            setScanResult(null)
            onClose?.()
          }}
        />
      )}
    </Modal>
  )
}

