import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { api } from '../services/api.js'
import { Spinner } from '../components/Spinner.jsx'
import PersonRow from '../components/PersonRow.jsx'

export default function PeoplePage() {
  const { accessToken } = useAuth()
  const [people, setPeople] = useState(null)   // null = loading, array = loaded
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    setPeople(null)
    api.get('/me/balances/people', { token: accessToken })
      .then(r => setPeople(r.people || []))
      .catch(e => setError(e?.message || 'Failed to load balances'))
  }, [accessToken])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">People</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Who owes you and who you owe, across all your groups. Tap a person to see the per-group breakdown.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          <button onClick={load} className="text-sm font-medium text-red-700 dark:text-red-300 underline">Retry</button>
        </div>
      )}

      {!error && people === null && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" className="text-blue-600" />
        </div>
      )}

      {!error && people !== null && people.length === 0 && (
        <div className="text-center py-12 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
          <div className="text-4xl mb-3">🎉</div>
          <div className="text-neutral-700 dark:text-neutral-200 font-medium">All settled up.</div>
          <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            When friends owe you or vice versa, they'll show up here.
          </div>
        </div>
      )}

      {!error && people !== null && people.length > 0 && (
        <div className="space-y-3">
          {people.map(p => <PersonRow key={p.user_id} person={p} />)}
        </div>
      )}
    </div>
  )
}
