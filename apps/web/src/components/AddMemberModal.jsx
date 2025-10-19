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
      <div className="p-6">
        <div className="text-xl font-semibold mb-4">Add members</div>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Members</label>
            <input 
              className="mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2" 
              placeholder="Emails or names (comma/space separated)" 
              value={value} 
              onChange={e=>setValue(e.target.value)} 
              autoFocus 
            />
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Add emails for registered users or names for offline members</div>
          </div>
          <div className="flex items-center justify-between gap-3 pt-2">
            <button type="button" className="text-neutral-600 dark:text-neutral-300 px-4 py-2" onClick={()=>{ clear(); onClose?.() }}>Cancel</button>
            <button className="bg-blue-600 text-white rounded-md px-6 py-2" type="submit">Add</button>
          </div>
        </form>
      </div>
    </Modal>
  )
}


