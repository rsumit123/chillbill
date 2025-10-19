import Modal from './Modal.jsx'

export default function ConfirmDialog({ open, title='Are you sure?', message, confirmText='Delete', cancelText='Cancel', onConfirm, onClose }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6">
        <div className="text-xl font-semibold mb-3">{title}</div>
        {message && <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">{message}</div>}
        <div className="flex items-center justify-between gap-3">
          <button className="text-neutral-600 dark:text-neutral-300 px-4 py-2" onClick={onClose}>{cancelText}</button>
          <button className="bg-red-600 text-white rounded-md px-6 py-2" onClick={()=>{ onConfirm?.(); onClose?.() }}>{confirmText}</button>
        </div>
      </div>
    </Modal>
  )}


