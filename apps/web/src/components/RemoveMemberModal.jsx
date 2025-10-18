import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'

export default function RemoveMemberModal({ open, onClose, members = [], currentUserId, onRemove }) {
  const eligible = members.filter(m => (m.user_id || '') !== (currentUserId || ''))
  const [memberId, setMemberId] = useState(eligible[0]?.member_id || null)
  useEffect(()=>{ setMemberId(eligible[0]?.member_id || null) }, [open, members, currentUserId])

  if (!open) return null
  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-4 sm:p-6">
        <div className="text-lg font-semibold mb-2">Remove member</div>
        <div className="space-y-2">
          <select className="w-full border rounded-md px-2 py-2" value={memberId || ''} onChange={e=>setMemberId(Number(e.target.value))}>
            {eligible.map(m => (
              <option key={m.member_id} value={m.member_id}>{m.name || m.email}{m.is_ghost?' (offline)':''}</option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          <button className="text-neutral-600" onClick={onClose}>Cancel</button>
          <button className="bg-red-600 text-white rounded-md px-4 py-2" disabled={!memberId} onClick={()=>{ onRemove?.(memberId); onClose?.() }}>Remove</button>
        </div>
      </div>
    </Modal>
  )
}


