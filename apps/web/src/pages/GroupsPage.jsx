import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { api } from '../services/api.js'
import { useToast } from '../components/Toast.jsx'
import NewGroupModal from '../components/NewGroupModal.jsx'
import { Avatar, GroupBadge } from '../components/Avatar.jsx'
import { Icon } from '../components/Icons.jsx'
import { toINR } from '../services/fx.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import KebabMenu from '../components/KebabMenu.jsx'
import { Spinner } from '../components/Spinner.jsx'

export default function GroupsPage() {
  const { accessToken, user } = useAuth()
  const navigate = useNavigate()
  const { push } = useToast()
  const [summary, setSummary] = useState({ totalOwes: 0, totalOwed: 0, byGroup: {} })

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
        // compute dashboard summary in INR
        const balances = await Promise.allSettled(
          data.map(g => api.get(`/groups/${g.id}/balances`, { token: accessToken }))
        )
        const byGroup = {}
        let totalOwesINR = 0, totalOwedINR = 0
        for (let i = 0; i < balances.length; i++) {
          const r = balances[i]
          if (r.status === 'fulfilled') {
            const bal = r.value.balances || {}
            const mine = Number(bal[user?.id] || 0) // in group currency
            const gcur = groupsWithMembers[i]?.currency || 'INR'
            const mineINR = await toINR(Math.abs(mine), gcur)
            if (mine > 0) totalOwedINR += mineINR; if (mine < 0) totalOwesINR += mineINR
            byGroup[data[i].id] = mine
          }
        }
        if (mounted) setSummary({ totalOwed: totalOwedINR, totalOwes: totalOwesINR, byGroup })
      } catch (e) { if (mounted) setError(e.message) }
      finally { if (mounted) setLoading(false) }
    }
    load()
    return () => { mounted = false }
  }, [accessToken])

  async function createGroupViaModal({ name, currency, emails, icon }) {
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
    } else {
      push('Created a personal group. You can add members later.', 'info')
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
    } catch (e) { push(e.message || 'Delete failed', 'error') }
    finally { setDeleteTarget(null) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" className="text-blue-600" />
        <div className="text-sm text-neutral-600 dark:text-neutral-400">Loading groups...</div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Your groups</h1>
        <p className="text-neutral-600 dark:text-neutral-400">Create groups to track shared expenses.</p>
      </div>
      <div className="rounded-lg border bg-white dark:bg-neutral-900 p-3 mb-2 flex items-center justify-between">
        <div className="text-sm text-neutral-700">Dashboard</div>
        <div className="flex items-center gap-6 text-sm">
          <div className="text-red-700">You owe: ₹{summary.totalOwes.toFixed(2)}</div>
          <div className="text-green-700">You're owed: ₹{summary.totalOwed.toFixed(2)}</div>
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


