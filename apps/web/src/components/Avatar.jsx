export function Avatar({ name, size=28, ghost=false }) {
  const initials = (name||'').split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase() || 'U'
  return (
    <div style={{ width: size, height: size }} className={`inline-flex items-center justify-center rounded-full text-xs font-medium ${ghost? 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-300':'bg-neutral-200 text-neutral-700'}`}>
      {ghost ? (
        <svg width="60%" height="60%" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7v11l2-1 2 1 2-1 2 1 2-1 2 1V9a7 7 0 0 0-7-7z"/></svg>
      ) : initials}
    </div>
  )
}

export function GroupBadge({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200">
      {icon}
      {label}
    </span>
  )
}


