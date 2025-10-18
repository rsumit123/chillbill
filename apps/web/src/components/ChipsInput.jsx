import React, { useState } from 'react'

function isValidEmail(v) {
  return /.+@.+\..+/.test(v)
}

export default function ChipsInput({ value = [], onChange, placeholder }) {
  const [input, setInput] = useState('')

  function commit(tokens) {
    const emails = tokens.map(t => t.trim()).filter(Boolean)
    const next = [...value]
    emails.forEach(e => { if (!next.includes(e)) next.push(e) })
    onChange?.(next)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault()
      const tokens = input.split(/[\s,]+/)
      commit(tokens)
      setInput('')
    } else if (e.key === 'Backspace' && !input && value.length) {
      onChange?.(value.slice(0, -1))
    }
  }

  function onBlur() {
    if (input.trim()) { commit([input]); setInput('') }
  }

  function removeChip(e) { onChange?.(value.filter(v => v !== e)) }

  function onPaste(e) {
    const text = e.clipboardData.getData('text')
    if (text && /[,\s]/.test(text)) {
      e.preventDefault()
      commit(text.split(/[\s,]+/))
    }
  }

  return (
    <div className="min-h-[42px] border rounded-md px-2 py-1 flex items-center gap-1 flex-wrap">
      {value.map(email => (
        <span key={email} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${isValidEmail(email)?'bg-blue-50 text-blue-700':'bg-red-50 text-red-700'}`}>
          {email}
          <button type="button" className="opacity-70 hover:opacity-100" onClick={()=>removeChip(email)}>×</button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[140px] outline-none bg-transparent py-1"
        value={input}
        onChange={e=>setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onPaste={onPaste}
        placeholder={placeholder}
      />
    </div>
  )
}


