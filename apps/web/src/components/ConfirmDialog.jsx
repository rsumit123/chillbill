import Modal from './Modal.jsx'

export default function ConfirmDialog({ open, title='Are you sure?', message, confirmText='Delete', cancelText='Cancel', onConfirm, onClose }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-4 sm:p-6">
        <div className="text-lg font-semibold mb-2">{title}</div>
        {message && <div className="text-sm text-neutral-600 mb-4">{message}</div>}
        <div className="flex items-center justify-end gap-3">
          <button className="text-neutral-600" onClick={onClose}>{cancelText}</button>
          <button className="bg-red-600 text-white rounded-md px-4 py-2" onClick={()=>{ onConfirm?.(); onClose?.() }}>{confirmText}</button>
        </div>
      </div>
    </Modal>
  )}


