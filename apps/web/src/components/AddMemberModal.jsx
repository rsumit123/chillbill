import { useState } from 'react'
import Modal from './Modal.jsx'

export default function AddMemberModal({ open, onClose, onAdd }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  function clear() { setValue(''); setError('') }

  async function submit(e) {
    e?.preventDefault?.()
    const tokens = value.split(/[\,\s]+/).map(t=>t.trim()).filter(Boolean)
    if (!tokens.length) { setError('Enter at least one email or name'); return }
    await onAdd?.(tokens)
    clear(); onClose?.()
  }

  if (!open) return null
  return (
    <Modal open={open} onClose={()=>{ clear(); onClose?.() }}>
      <div className="p-4 sm:p-6">
        <div className="text-lg font-semibold mb-2">Add members</div>
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        <form onSubmit={submit} className="space-y-2">
          <input className="w-full border rounded-md px-3 py-2" placeholder="Emails or names (comma/space separated)" value={value} onChange={e=>setValue(e.target.value)} autoFocus />
          <div className="flex items-center justify-end gap-3">
            <button type="button" className="text-neutral-600" onClick={()=>{ clear(); onClose?.() }}>Cancel</button>
            <button className="bg-blue-600 text-white rounded-md px-4 py-2" type="submit">Add</button>
          </div>
        </form>
      </div>
    </Modal>
  )
}


