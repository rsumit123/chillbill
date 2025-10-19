import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { api } from '../services/api.js'
import { useToast } from '../components/Toast.jsx'
import NewGroupModal from '../components/NewGroupModal.jsx'
import { Avatar, GroupBadge } from '../components/Avatar.jsx'
import { Icon } from '../components/Icons.jsx'
import { convert, getRatesInfo } from '../services/fx.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import KebabMenu from '../components/KebabMenu.jsx'
import { Spinner } from '../components/Spinner.jsx'

export default function GroupsPage() {
  const { accessToken, user } = useAuth()
  const navigate = useNavigate()
  const { push } = useToast()
  const [summary, setSummary] = useState({ totalOwes: 0, totalOwed: 0, byGroup: {} })
  const [displayCurrency, setDisplayCurrency] = useState('INR')
  const [ratesInfo, setRatesInfo] = useState(null)
  const [showRates, setShowRates] = useState(false)

  function currency(amount, currencyCode) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode || 'INR' }).format(amount) } catch { return amount.toFixed(2) }
  }
  const [groups, setGroups] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inviteOnCreate, setInviteOnCreate] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const data = await api.get('/groups/', { token: accessToken })
        // fetch details to get member names for avatars and group currency
        const detailed = await Promise.allSettled(
          data.map(g => api.get(`/groups/${g.id}`, { token: accessToken }))
        )
        const groupsWithMembers = data.map((g, i) => ({ ...g, ...detailed[i].status==='fulfilled' ? { icon: detailed[i].value.icon, currency: detailed[i].value.currency } : {}, _members: detailed[i].status==='fulfilled' ? detailed[i].value.members : [] }))
        if (mounted) setGroups(groupsWithMembers)
        
        // Get exchange rates info
        const rates = getRatesInfo()
        if (mounted) setRatesInfo(rates)
        
        // compute dashboard summary in selected display currency
        await computeSummary(data, groupsWithMembers)
      } catch (e) { if (mounted) setError(e.message) }
      finally { if (mounted) setLoading(false) }
    }
    load()
    return () => { mounted = false }
  }, [accessToken])

  async function computeSummary(data, groupsWithMembers) {
    const balances = await Promise.allSettled(
      data.map(g => api.get(`/groups/${g.id}/balances`, { token: accessToken }))
    )
    const byGroup = {}
    let totalOwes = 0, totalOwed = 0
    for (let i = 0; i < balances.length; i++) {
      const r = balances[i]
      if (r.status === 'fulfilled') {
        const bal = r.value.balances || {}
        const mine = Number(bal[user?.id] || 0) // in group currency
        const gcur = groupsWithMembers[i]?.currency || 'INR'
        // Convert to display currency
        const mineConverted = await convert(Math.abs(mine), gcur, displayCurrency)
        if (mine > 0) totalOwed += mineConverted
        if (mine < 0) totalOwes += mineConverted
        byGroup[data[i].id] = mine
      }
    }
    setSummary({ totalOwed, totalOwes, byGroup })
  }

  // Recompute summary when display currency changes
  useEffect(() => {
    if (groups.length > 0) {
      const data = groups.map(g => ({ id: g.id, name: g.name }))
      computeSummary(data, groups)
    }
  }, [displayCurrency])

  async function createGroupViaModal({ name, currency, emails, icon }) {
    try {
      const g = await api.post('/groups/', { name, currency, icon }, { token: accessToken })
      setGroups(prev => [{ ...g, _members: [] }, ...prev])
      if (emails?.length) {
        // Detect if each entry is an email or a name
        const memberPromises = emails.map(entry => {
          const isEmail = /.+@.+\..+/.test(entry)
          const payload = isEmail ? { email: entry } : { name: entry }
          return api.post(`/groups/${g.id}/members`, payload, { token: accessToken })
        })
        await Promise.allSettled(memberPromises)
        push('Group created with members successfully', 'success')
      } else {
        push('Group created successfully. You can add members later.', 'success')
      }
    } catch (err) {
      push(err.message || 'Failed to create group', 'error')
    }
  }

  function requestDelete(g) {
    setDeleteTarget(g)
    setConfirmOpen(true)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await api.del(`/groups/${deleteTarget.id}`, { token: accessToken })
      setGroups(prev => prev.filter(x => x.id !== deleteTarget.id))
      push('Group deleted successfully', 'success')
    } catch (e) { 
      push(e.message || 'Failed to delete group', 'error') 
    } finally { 
      setDeleteTarget(null) 
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" className="text-blue-600" />
        <div className="text-sm text-neutral-600 dark:text-neutral-400">Loading groups...</div>
      </div>
    </div>
  )

  const popularCurrencies = ['INR', 'USD', 'EUR', 'GBP', 'THB', 'CAD', 'AUD', 'JPY']
  const currencySymbols = { INR: '₹', USD: '$', EUR: '€', GBP: '£', THB: '฿', CAD: 'C$', AUD: 'A$', JPY: '¥' }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Your groups</h1>
        <p className="text-neutral-600 dark:text-neutral-400">Create groups to track shared expenses.</p>
      </div>
      
      {/* Dashboard Summary Card */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        {/* Header with Currency Selector */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-3 sm:p-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Title and Info Button */}
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                <span className="hidden sm:inline">Dashboard Summary</span>
                <span className="sm:hidden">Summary</span>
              </div>
              {ratesInfo && (
                <button 
                  onClick={() => setShowRates(!showRates)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 whitespace-nowrap"
                  title={showRates ? "Hide exchange rates" : "View exchange rates"}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="hidden sm:inline">{showRates ? 'Hide Rates' : 'View Rates'}</span>
                  <span className="sm:hidden">{showRates ? 'Hide' : 'Rates'}</span>
                </button>
              )}
            </div>
            
            {/* Currency Selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-600 dark:text-neutral-400 hidden sm:inline">Currency:</label>
              <select 
                value={displayCurrency} 
                onChange={(e) => setDisplayCurrency(e.target.value)}
                className="text-sm border border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 rounded-md px-2 py-1.5 font-medium w-full sm:w-auto"
              >
                {popularCurrencies.map(curr => (
                  <option key={curr} value={curr}>{currencySymbols[curr]} {curr}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Exchange Rates Info */}
          {showRates && ratesInfo && (
            <div className="mt-3 p-3 bg-white/60 dark:bg-neutral-900/60 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Exchange Rates 
                  <span className={`ml-2 px-2 py-0.5 rounded text-[10px] ${ratesInfo.isFallback ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                    {ratesInfo.isFallback ? 'Static' : 'Live'}
                  </span>
                </div>
                {ratesInfo.lastUpdated && !ratesInfo.isFallback && (
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Updated: {new Date(ratesInfo.lastUpdated).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {popularCurrencies.filter(c => c !== displayCurrency).map(curr => {
                  const rate = ratesInfo.rates[curr] / ratesInfo.rates[displayCurrency]
                  return (
                    <div key={curr} className="bg-white dark:bg-neutral-800 rounded px-2 py-1 border border-neutral-200 dark:border-neutral-700">
                      <span className="text-neutral-500 dark:text-neutral-400">1 {curr} =</span>
                      <span className="ml-1 font-medium text-neutral-700 dark:text-neutral-300">
                        {currencySymbols[displayCurrency]}{rate.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        
        {/* Summary Totals */}
        <div className="p-4 flex items-center justify-center gap-8">
          <div className="text-center">
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">You owe</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {currency(summary.totalOwes, displayCurrency)}
            </div>
          </div>
          <div className="w-px h-12 bg-neutral-200 dark:bg-neutral-700"></div>
          <div className="text-center">
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">You're owed</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {currency(summary.totalOwed, displayCurrency)}
            </div>
          </div>
        </div>
      </div>
      <div className="flex">
        <button className="bg-neutral-900 text-white rounded-md px-4 h-10" onClick={()=>setModalOpen(true)}>New group</button>
      </div>
      {loading ? <div>Loading...</div> : error ? <div className="text-red-600">{error}</div> : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {groups.map(g => {
            const mine = summary.byGroup[g.id] || 0
            const badge = mine > 0 ? { text: `You're owed ${currency(mine, g.currency)}`, cls: 'bg-green-50 text-green-700 ring-green-600/20' }
              : mine < 0 ? { text: `You owe ${currency(Math.abs(mine), g.currency)}`, cls: 'bg-red-50 text-red-700 ring-red-600/20' }
              : { text: 'Settled up', cls: 'bg-neutral-50 text-neutral-600 ring-neutral-400/30' }
            return (
              <li key={g.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/groups/${g.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/groups/${g.id}`) }}
                  className="border rounded-lg p-4 bg-white dark:bg-neutral-900 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GroupBadge icon={<Icon id={g.icon || 'group'} size={14} />} />
                      <div className="font-medium">
                        <Link to={`/groups/${g.id}`} className="hover:underline">{g.name}</Link>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-md ring-1 ${badge.cls}`}>{badge.text}</span>
                      <KebabMenu items={[{ label: 'Open', onClick: ()=>navigate(`/groups/${g.id}`) }, { label: 'Delete', destructive: true, onClick: ()=>requestDelete(g) }]} />
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500">Currency: {g.currency}</div>
                  {g._members?.length ? (
                    <div className="flex items-center gap-1 mt-1">
                      {g._members.slice(0,4).map(m => (
                        <Avatar key={m.user_id} name={m.name || m.email} size={22} />
                      ))}
                      {g._members.length > 4 && (
                        <span className="text-xs text-neutral-500">+{g._members.length - 4}</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <NewGroupModal open={modalOpen} onClose={()=>setModalOpen(false)} onCreate={createGroupViaModal} />
      <ConfirmDialog open={confirmOpen} onClose={()=>setConfirmOpen(false)} onConfirm={confirmDelete} title="Delete group?" message="This will permanently remove the group and its data." confirmText="Delete" />
    </div>
  )
}


