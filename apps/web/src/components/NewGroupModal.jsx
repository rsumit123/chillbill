import React, { useState } from 'react'
import Modal from './Modal.jsx'
import ChipsInput from './ChipsInput.jsx'
import { Icon } from './Icons.jsx'

const ICONS = ['group','trip','home','event','food','work']

const CURRENCIES = [
  { code: 'INR', flag: '🇮🇳', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', flag: '🇺🇸', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', flag: '🇪🇺', symbol: '€', name: 'Euro' },
  { code: 'GBP', flag: '🇬🇧', symbol: '£', name: 'British Pound' },
  { code: 'THB', flag: '🇹🇭', symbol: '฿', name: 'Thai Baht' },
  { code: 'CAD', flag: '🇨🇦', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', flag: '🇦🇺', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'JPY', flag: '🇯🇵', symbol: '¥', name: 'Japanese Yen' },
]

export default function NewGroupModal({ open, onClose, onCreate }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [icon, setIcon] = useState('group')
  const [showAllCurrencies, setShowAllCurrencies] = useState(false)

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
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Group name</label>
              <input 
                className="w-full border dark:border-neutral-700 dark:bg-neutral-800 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                placeholder="Trip to Goa, Flatmates…" 
                value={name} 
                onChange={e=>setName(e.target.value)} 
                autoFocus 
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Currency</label>
              <div className="space-y-2">
                {/* Popular currencies */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CURRENCIES.slice(0, 4).map(curr => (
                    <button 
                      type="button" 
                      key={curr.code} 
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        currency===curr.code
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400 dark:hover:border-blue-600'
                      }`} 
                      onClick={()=>setCurrency(curr.code)}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-base">{curr.flag}</span>
                        <span>{curr.code}</span>
                      </div>
                    </button>
                  ))}
                </div>
                
                {/* Show more button */}
                {!showAllCurrencies && (
                  <button
                    type="button"
                    onClick={() => setShowAllCurrencies(true)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    + Show more currencies
                  </button>
                )}
                
                {/* All currencies */}
                {showAllCurrencies && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t dark:border-neutral-700">
                    {CURRENCIES.slice(4).map(curr => (
                      <button 
                        type="button" 
                        key={curr.code} 
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          currency===curr.code
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400 dark:hover:border-blue-600'
                        }`} 
                        onClick={()=>setCurrency(curr.code)}
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-base">{curr.flag}</span>
                          <span>{curr.code}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Icon</label>
              <div className="flex gap-2 flex-wrap">
                {ICONS.map(ic => (
                  <button 
                    key={ic} 
                    type="button" 
                    onClick={()=>setIcon(ic)} 
                    className={`p-2.5 rounded-lg border transition-colors ${
                      icon===ic
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400 dark:hover:border-blue-600'
                    }`}
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
              <ChipsInput value={emails} onChange={setEmails} placeholder="john@example.com, Sarah, Mike…" />
            </div>
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 space-y-1">
              <div className="text-xs font-medium text-blue-900 dark:text-blue-200">💡 Tip: Mix registered & offline members</div>
              <div className="text-xs text-blue-700 dark:text-blue-300">
                • Type <strong>emails</strong> (user@example.com) for registered users<br />
                • Type <strong>names</strong> (Sarah, Mike) for offline members<br />
                • Press Enter or comma to add each member
              </div>
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


