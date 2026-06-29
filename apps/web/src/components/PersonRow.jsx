import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from './Avatar.jsx'

function fmt(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return Number(amount).toFixed(2)
  }
}

function BalanceLine({ amount, currency }) {
  const positive = amount > 0
  const negative = amount < 0
  if (!positive && !negative) return null
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className={positive ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
        {positive ? 'owes you' : 'you owe'}
      </span>
      <span className={`font-semibold ${positive ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
        {fmt(Math.abs(amount), currency)}
      </span>
    </div>
  )
}

export default function PersonRow({ person }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
        aria-expanded={open}
      >
        <Avatar name={person.name} url={person.avatar_url} size={40} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{person.name}</div>
          <div className="mt-1 space-y-0.5">
            {Object.entries(person.balances).map(([currency, amount]) => (
              <BalanceLine key={currency} amount={amount} currency={currency} />
            ))}
          </div>
        </div>
        <svg className={`w-5 h-5 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
          {person.groups.map(g => {
            const positive = g.balance > 0
            const negative = g.balance < 0
            return (
              <button
                key={g.group_id + g.currency}
                type="button"
                onClick={() => navigate(`/dashboard/groups/${g.group_id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{g.group_name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{g.currency}</div>
                </div>
                <div className={`text-sm font-medium ${positive ? 'text-green-700 dark:text-green-400' : negative ? 'text-red-700 dark:text-red-400' : ''}`}>
                  {positive ? 'owes you ' : negative ? 'you owe ' : ''}
                  {fmt(Math.abs(g.balance), g.currency)}
                </div>
                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
