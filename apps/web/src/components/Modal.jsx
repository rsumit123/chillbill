import React, { useEffect } from 'react'

export default function Modal({ open, onClose, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    if (open) {
      document.addEventListener('keydown', onKey)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div 
          className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  )
}


