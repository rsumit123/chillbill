import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((message, variant='info', ttl=3000) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, variant }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ttl)
  }, [])

  const ctx = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(t => (
          <div key={t.id} className={`px-3 py-2 rounded-md shadow text-sm text-white ${t.variant==='error'?'bg-red-600':t.variant==='success'?'bg-green-600':'bg-neutral-800'}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() { return useContext(ToastContext) }


