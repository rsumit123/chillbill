import { useState, useEffect } from 'react'
import { detectRegion, SUGGESTED_METHODS, ALL_METHOD_TYPES } from '../services/geo.js'
import { paymentMethodLabel } from '../services/payments.js'

function rowKey(idx) { return `row-${idx}` }

export default function PaymentMethodsEditor({ initial = [], onSave, saving = false }) {
  const [rows, setRows] = useState(initial.length ? initial : [])
  const [showAllTypes, setShowAllTypes] = useState(false)
  const region = detectRegion()
  const suggested = SUGGESTED_METHODS[region] || SUGGESTED_METHODS.OTHER
  const typeOptions = showAllTypes ? ALL_METHOD_TYPES : suggested

  useEffect(() => { setRows(initial) }, [JSON.stringify(initial)])

  function setRow(idx, patch) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }
  function removeRow(idx) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }
  function addRow(type) {
    setRows(prev => [...prev, { type, value: '' }])
  }

  function handleSave(e) {
    e?.preventDefault()
    // Drop empty rows
    const cleaned = rows
      .map(r => ({ type: r.type, value: (r.value || '').trim() }))
      .filter(r => r.value.length > 0)
    onSave?.(cleaned)
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            No payment methods yet. Add one below so friends can pay you in one tap.
          </div>
        )}
        {rows.map((r, idx) => {
          const opt = ALL_METHOD_TYPES.find(t => t.type === r.type) || { placeholder: '' }
          return (
            <div key={rowKey(idx)} className="flex items-center gap-2">
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 w-24 shrink-0">
                {paymentMethodLabel(r.type)}
              </div>
              <input
                value={r.value}
                onChange={e => setRow(idx, { value: e.target.value })}
                placeholder={opt.placeholder}
                className="flex-1 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-800"
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                aria-label="Remove"
                className="text-neutral-400 hover:text-red-600 p-2"
              >×</button>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {typeOptions.map(opt => (
          <button
            key={opt.type}
            type="button"
            onClick={() => addRow(opt.type)}
            className="text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 px-3 py-1.5 rounded-lg"
          >+ {opt.label}</button>
        ))}
        {!showAllTypes && (
          <button
            type="button"
            onClick={() => setShowAllTypes(true)}
            className="text-xs text-blue-600 dark:text-blue-400 px-3 py-1.5"
          >More options</button>
        )}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
      >
        {saving ? 'Saving…' : 'Save payment methods'}
      </button>
    </form>
  )
}
