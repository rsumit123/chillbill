import React, { useState } from 'react'
import Modal from './Modal.jsx'
import ChipsInput from './ChipsInput.jsx'
import { Icon } from './Icons.jsx'

const ICONS = ['group','trip','home','event','food','work']

export default function NewGroupModal({ open, onClose, onCreate }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [icon, setIcon] = useState('group')

  function reset() {
    setStep(1); setName(''); setCurrency('INR'); setEmails([]); setLoading(false)
  }

  async function handleCreate() {
    setLoading(true)
    try { await onCreate?.({ name, currency, emails, icon }) } finally { setLoading(false); reset(); onClose?.() }
  }

  return (
    <Modal open={open} onClose={()=>{ reset(); onClose?.() }}>
      <div className="p-6">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Create group</div>
          <div className="text-xl font-semibold">{step===1? 'Name & currency' : 'Add members'}</div>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-neutral-700 dark:text-neutral-300">Group name</label>
              <input 
                className="mt-1 w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-3 py-2" 
                placeholder="Trip to Goa, Flatmates…" 
                value={name} 
                onChange={e=>setName(e.target.value)} 
                autoFocus 
              />
            </div>
            <div>
              <label className="text-sm text-neutral-700 dark:text-neutral-300">Currency</label>
              <div className="mt-1 inline-flex rounded-md border dark:border-neutral-700 overflow-hidden">
                {['INR','USD','EUR'].map(c => (
                  <button 
                    type="button" 
                    key={c} 
                    className={`px-3 py-2 text-sm ${currency===c?'bg-blue-600 text-white':'bg-white dark:bg-neutral-800'}`} 
                    onClick={()=>setCurrency(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-neutral-700 dark:text-neutral-300">Icon</label>
              <div className="mt-1 flex gap-2 flex-wrap">
                {ICONS.map(ic => (
                  <button 
                    key={ic} 
                    type="button" 
                    onClick={()=>setIcon(ic)} 
                    className={`px-2 py-2 rounded-md border dark:border-neutral-700 text-sm flex items-center justify-center w-10 h-10 ${icon===ic?'bg-blue-600 text-white':'bg-white dark:bg-neutral-800'}`}
                  >
                    <Icon id={ic} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-neutral-700 dark:text-neutral-300">Members (optional)</label>
              <ChipsInput value={emails} onChange={setEmails} placeholder="Type or paste emails, press Enter" />
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Leave empty to create a personal group; you can invite later.</div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button 
            className="text-neutral-600 dark:text-neutral-300 px-4 py-2" 
            onClick={()=> step===1 ? onClose?.() : setStep(1)}
          >
            {step===1?'Cancel':'Back'}
          </button>
          {step===1 ? (
            <button 
              disabled={!name.trim()} 
              className="bg-blue-600 text-white rounded-md px-6 py-2 disabled:opacity-50" 
              onClick={()=>setStep(2)}
            >
              Next
            </button>
          ) : (
            <button 
              disabled={loading || !name.trim()} 
              className="bg-blue-600 text-white rounded-md px-6 py-2 disabled:opacity-50" 
              onClick={handleCreate}
            >
              {loading?'Creating…':'Create'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}


