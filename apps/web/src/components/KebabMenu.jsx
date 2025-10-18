import { useEffect, useRef, useState } from 'react'

export default function KebabMenu({ items = [], onOpen, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button className="px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800" onClick={(e)=>{ e.stopPropagation(); setOpen(v=>!v); onOpen?.() }} aria-label="More options">⋯</button>
      {open && (
        <div className={`absolute mt-1 min-w-[160px] z-20 border rounded-md bg-white dark:bg-neutral-900 shadow ${align==='right'?'right-0':'left-0'}`} onClick={(e)=>e.stopPropagation()}>
          {items.map((it, idx) => (
            <button key={idx} className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${it.destructive?'text-red-600':''}`} onClick={()=>{ setOpen(false); it.onClick?.() }} disabled={it.disabled}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}


