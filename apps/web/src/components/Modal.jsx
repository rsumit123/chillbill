import React, { useEffect } from 'react'

export default function Modal({ open, onClose, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-end sm:items-center justify-center p-0 sm:p-6">
        <div className="w-full sm:max-w-lg bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}


