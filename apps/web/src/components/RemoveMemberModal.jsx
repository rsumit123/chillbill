import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'

export default function RemoveMemberModal({ open, onClose, members = [], currentUserId, onRemove }) {
  const eligible = members.filter(m => (m.user_id || '') !== (currentUserId || ''))
  const [memberId, setMemberId] = useState(eligible[0]?.member_id || null)
  useEffect(()=>{ setMemberId(eligible[0]?.member_id || null) }, [open, members, currentUserId])

  if (!open) return null
  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6">
        <div className="text-xl font-semibold mb-4">Remove member</div>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-neutral-700 dark:text-neutral-300">Select member to remove</label>
            <select 
              className="mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2" 
              value={memberId || ''} 
              onChange={e=>setMemberId(Number(e.target.value))}
            >
              {eligible.map(m => (
                <option key={m.member_id} value={m.member_id}>{m.name || m.email}{m.is_ghost?' (offline)':''}</option>
              ))}
            </select>
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">You cannot remove yourself from the group</div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button className="text-neutral-600 dark:text-neutral-300 px-4 py-2" onClick={onClose}>Cancel</button>
          <button className="bg-red-600 text-white rounded-md px-6 py-2" disabled={!memberId} onClick={()=>{ onRemove?.(memberId); onClose?.() }}>Remove</button>
        </div>
      </div>
    </Modal>
  )
}


