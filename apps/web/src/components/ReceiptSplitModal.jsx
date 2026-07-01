import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { api } from '../services/api.js'
import { useToast } from './Toast.jsx'

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return Number(amount).toFixed(2)
  }
}

function round2(n) { return Math.round(n * 100) / 100 }

function initials(name) {
  if (!name) return '??'
  return name.split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase()
}

export default function ReceiptSplitModal({ open, onClose, parsed, group, accessToken, onCreated }) {
  const { push } = useToast()
  const [items, setItems] = useState(() =>
    (parsed?.items || []).map((it, i) => ({
      id: i,
      name: it.name,
      quantity: it.quantity,
      line_total: it.line_total,
      assignees: new Set(),
    }))
  )
  const [extras] = useState(() => ({
    tax: parsed?.tax || 0,
    tip: parsed?.tip || 0,
    service_charge: parsed?.service_charge || 0,
    discount: parsed?.discount || 0,
  }))
  const [paidByMemberId, setPaidByMemberId] = useState(null)
  const [pickerFor, setPickerFor] = useState(null)
  const [saving, setSaving] = useState(false)

  const currency = group?.currency || parsed?.currency || 'INR'
  const members = group?.members || []
  const total = parsed?.total || 0
  const merchant = parsed?.merchant || 'Receipt'
  const confidence = parsed?.confidence || 'high'

  const perPerson = useMemo(() => {
    const totalFood = items.reduce((s, i) => s + Number(i.line_total || 0), 0) || 1
    const extraSum = Number(extras.tax || 0) + Number(extras.tip || 0) + Number(extras.service_charge || 0) - Number(extras.discount || 0)
    const food = {}
    for (const it of items) {
      if (it.assignees.size === 0) continue
      const share = Number(it.line_total || 0) / it.assignees.size
      for (const mid of it.assignees) {
        food[mid] = (food[mid] || 0) + share
      }
    }
    const out = {}
    for (const [mid, f] of Object.entries(food)) {
      out[mid] = round2(f + (f / totalFood) * extraSum)
    }
    const sum = Object.values(out).reduce((a, b) => a + b, 0)
    const diff = round2(total - sum)
    if (Math.abs(diff) > 0 && Object.keys(out).length > 0) {
      let maxKey = null, maxVal = -Infinity
      for (const [k, v] of Object.entries(out)) {
        if (v > maxVal) { maxKey = k; maxVal = v }
      }
      if (maxKey) out[maxKey] = round2(maxVal + diff)
    }
    return out
  }, [items, extras, total])

  const unassignedCount = items.filter(i => i.assignees.size === 0).length

  function toggleAssignee(itemId, memberId) {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it
      const next = new Set(it.assignees)
      if (next.has(memberId)) next.delete(memberId); else next.add(memberId)
      return { ...it, assignees: next }
    }))
  }

  function assignAll(itemId) {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it
      return { ...it, assignees: new Set(members.map(m => m.member_id)) }
    }))
  }

  function editLineTotal(itemId, value) {
    const v = Number(value || 0)
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, line_total: v } : it))
  }

  function deleteItem(itemId) {
    setItems(prev => prev.filter(it => it.id !== itemId))
  }

  async function save() {
    if (unassignedCount > 0) return
    if (!paidByMemberId) { push('Pick who paid', 'error'); return }
    setSaving(true)
    try {
      const splits = Object.entries(perPerson).map(([mid, amt]) => ({
        member_id: Number(mid),
        share_amount: Number(amt),
        share_percentage: null,
      }))
      await api.post(`/groups/${group.id}/expenses`, {
        total_amount: total,
        currency,
        note: `${merchant} (scanned)`,
        paid_by_member_id: paidByMemberId,
        splits,
      }, { token: accessToken })
      push('Expense added', 'success')
      onCreated?.()
      onClose?.()
    } catch (e) {
      push(e.message || 'Failed to save', 'error')
    } finally { setSaving(false) }
  }

  if (!open) return null
  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="text-xl font-semibold">{merchant}</div>
            {parsed?.currency && parsed.currency !== currency && (
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Receipt in {parsed.currency}, group in {currency} — saving in {currency}.
              </div>
            )}
          </div>
          <div className="text-lg font-semibold">{fmt(total, currency)}</div>
        </div>

        {confidence === 'low' && (
          <div className="mb-3 p-2 rounded bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200">
            Numbers may need verifying — check the total matches your bill.
          </div>
        )}

        <div className="text-sm font-medium mb-2">Items</div>
        <div className="space-y-2">
          {items.map(it => (
            <div key={it.id} className="flex items-center gap-2 p-2 rounded border border-neutral-200 dark:border-neutral-800">
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">
                  {it.name}
                  {it.quantity > 1 && <span className="text-neutral-500"> × {it.quantity}</span>}
                </div>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 w-24 text-xs border rounded px-2 py-0.5 dark:bg-neutral-800 dark:border-neutral-700"
                  value={it.line_total}
                  onChange={e => editLineTotal(it.id, e.target.value)}
                  aria-label="line total"
                />
              </div>
              <button
                type="button"
                onClick={() => setPickerFor(it.id === pickerFor ? null : it.id)}
                className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200"
              >
                {it.assignees.size === 0 ? 'Assign ▸' : Array.from(it.assignees).map(mid => {
                  const m = members.find(x => x.member_id === mid)
                  return m ? initials(m.name || m.email) : '?'
                }).join(' ')}
              </button>
              <button
                type="button"
                onClick={() => deleteItem(it.id)}
                className="text-neutral-400 hover:text-red-600 text-lg leading-none"
                aria-label="delete item"
              >×</button>
            </div>
          ))}
        </div>

        {pickerFor !== null && (
          <div className="mt-2 p-2 border rounded bg-white dark:bg-neutral-900 dark:border-neutral-800">
            <div className="text-xs font-medium mb-1">Who had this item?</div>
            <button
              type="button"
              onClick={() => { assignAll(pickerFor); setPickerFor(null) }}
              className="text-xs text-blue-600 hover:underline mb-1"
            >Everyone</button>
            {members.map(m => (
              <label key={m.member_id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={items.find(x => x.id === pickerFor)?.assignees.has(m.member_id) ?? false}
                  onChange={() => toggleAssignee(pickerFor, m.member_id)}
                />
                {m.name || m.email}{m.is_ghost ? ' (offline)' : ''}
              </label>
            ))}
            <button type="button" onClick={() => setPickerFor(null)} className="text-xs text-neutral-500 mt-1">Done</button>
          </div>
        )}

        <div className="mt-4">
          <div className="text-sm font-medium mb-1">Extras (split proportionally)</div>
          <div className="text-xs text-neutral-500 space-y-0.5">
            {extras.tax > 0 && <div>Tax {fmt(extras.tax, currency)}</div>}
            {extras.tip > 0 && <div>Tip {fmt(extras.tip, currency)}</div>}
            {extras.service_charge > 0 && <div>Service charge {fmt(extras.service_charge, currency)}</div>}
            {extras.discount > 0 && <div>Discount −{fmt(extras.discount, currency)}</div>}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium mb-1">Per person</div>
          <div className="space-y-1">
            {members.map(m => (
              <div key={m.member_id} className="flex justify-between text-sm">
                <span>{m.name || m.email}{m.is_ghost ? ' (offline)' : ''}</span>
                <span className="font-medium">{fmt(perPerson[m.member_id] || 0, currency)}</span>
              </div>
            ))}
          </div>
        </div>

        {unassignedCount > 0 && (
          <div className="mt-3 p-2 rounded bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
            {unassignedCount} item{unassignedCount === 1 ? '' : 's'} haven't been assigned yet.
          </div>
        )}

        <div className="mt-4">
          <label className="text-sm text-neutral-700 dark:text-neutral-300">Paid by</label>
          <select
            className="mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2"
            value={paidByMemberId || ''}
            onChange={e => setPaidByMemberId(Number(e.target.value))}
          >
            <option value="" disabled>Pick a payer</option>
            {members.map(m => (
              <option key={m.member_id} value={m.member_id}>{m.name || m.email}</option>
            ))}
          </select>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button className="text-neutral-600 dark:text-neutral-300 px-4 py-2" onClick={onClose}>Back</button>
          <button
            type="button"
            className="bg-blue-600 text-white rounded-md px-6 py-2 disabled:opacity-50"
            disabled={saving || unassignedCount > 0 || !paidByMemberId}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Create expense'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
