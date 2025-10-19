import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { api } from '../services/api.js'
import { Avatar } from '../components/Avatar.jsx'
import { Icon } from '../components/Icons.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import EditExpenseModal from '../components/EditExpenseModal.jsx'
import KebabMenu from '../components/KebabMenu.jsx'
import AddMemberModal from '../components/AddMemberModal.jsx'
import RemoveMemberModal from '../components/RemoveMemberModal.jsx'
import { Spinner, ButtonSpinner } from '../components/Spinner.jsx'

function currency(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount) } catch { return amount.toFixed(2) }
}

export default function GroupDetailPage() {
  const { accessToken, user } = useAuth()
  const { groupId } = useParams()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [balances, setBalances] = useState(null)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [splits, setSplits] = useState([])
  const [mode, setMode] = useState('equal') // 'equal' | 'amount' | 'percent'
  const [paidBy, setPaidBy] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [amountError, setAmountError] = useState('')
  const [selected, setSelected] = useState({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [removeMemberOpen, setRemoveMemberOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const [g, ex, bal] = await Promise.all([
          api.get(`/groups/${groupId}`, { token: accessToken }),
          api.get(`/groups/${groupId}/expenses`, { token: accessToken }),
          api.get(`/groups/${groupId}/balances`, { token: accessToken }),
        ])
        if (mounted) {
          setGroup(g)
          setExpenses(ex)
          setBalances(bal)
          setSplits(g.members.map(m => ({ user_id: m.user_id, share_amount: 0, name: m.name || m.user_id, is_ghost: m.is_ghost, member_id: m.member_id })))
          // Set paid by to current user by default
          setPaidBy(user?.id || g.members[0]?.user_id || '')
        }
      } catch (e) { if (mounted) setError(e.message) } finally { if (mounted) setLoading(false) }
    }
    load()
    return () => { mounted = false }
  }, [groupId, accessToken])

  const total = useMemo(() => Number(amount || 0), [amount])

  // When amount or members change in equal mode, auto distribute
  useEffect(() => {
    if (!group || mode !== 'equal') return
    const n = Math.max(group.members.length, 1)
    const per = n ? +(total / n).toFixed(2) : 0
    setSplits(group.members.map(m => ({ user_id: m.user_id, name: m.name || m.user_id, share_amount: per, is_ghost: m.is_ghost, member_id: m.member_id })))
  }, [group?.members?.length, total, mode])

  function updateSplit(memberId, value) {
    const val = Number(value || 0)
    setSplits(prev => prev.map(s => s.member_id === memberId ? { ...s, share_amount: val } : s))
  }

  async function refreshLists() {
    const ex = await api.get(`/groups/${groupId}/expenses`, { token: accessToken })
    setExpenses(ex)
    const bal = await api.get(`/groups/${groupId}/balances`, { token: accessToken })
    setBalances(bal)
    const g = await api.get(`/groups/${groupId}`, { token: accessToken })
    setGroup(g)
  }

  async function addExpense(e) {
    e.preventDefault()
    if (!total || total <= 0 || Number.isNaN(total)) { setAmountError('Enter an amount greater than 0'); return }
    setAmountError('')
    setSubmitting(true)
    try {
      const payload = {
        total_amount: total,
        currency: group.currency,
        note: note || null,
        date: new Date().toISOString(),
        paid_by: paidBy || undefined,
        splits: mode==='percent'
          ? splits.map(s => ({ member_id: s.member_id, share_amount: +(total * (Number(s.share_percentage||0)/100)).toFixed(2), share_percentage: Number(s.share_percentage||0) }))
          : splits.map(s => ({ member_id: s.member_id, share_amount: Number(s.share_amount||0), share_percentage: null })),
      }
      await api.post(`/groups/${groupId}/expenses`, payload, { token: accessToken })
      setNote('')
      setAmount('')
      await refreshLists()
    } finally {
      setSubmitting(false)
    }
  }

  async function addMembers(tokens) {
    await Promise.allSettled(tokens.map(t => /.+@.+\..+/.test(t) ? api.post(`/groups/${groupId}/members`, { email: t }, { token: accessToken }) : api.post(`/groups/${groupId}/members`, { name: t }, { token: accessToken })))
    await refreshLists()
  }

  async function removeMember(memberId) {
    await api.del(`/groups/${groupId}/members/${memberId}`, { token: accessToken })
    await refreshLists()
  }

  async function deleteSelected() {
    setDeleting(true)
    try {
      const ids = Object.entries(selected).filter(([,v])=>v).map(([k])=>k)
      await Promise.allSettled(ids.map(id => api.del(`/groups/expenses/${id}`, { token: accessToken })))
      setSelected({})
      await refreshLists()
    } finally {
      setDeleting(false)
    }
  }

  async function deleteOne(id) {
    await api.del(`/groups/expenses/${id}`, { token: accessToken })
    await refreshLists()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" className="text-blue-600" />
        <div className="text-sm text-neutral-600 dark:text-neutral-400">Loading group...</div>
      </div>
    </div>
  )
  if (error) return <div className="text-red-600">{error}</div>
  if (!group) return null

  const memberMenu = [
    { label: 'Add member', onClick: ()=>setAddMemberOpen(true) },
    { label: 'Remove member…', destructive: true, onClick: ()=>setRemoveMemberOpen(true) }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Icon id={group.icon || 'group'} /> {group.name}</h1>
          <div className="text-neutral-600 flex items-center gap-1 mt-1">
            {group.members.slice(0,6).map(m => (
              <span key={m.member_id} title={m.is_ghost?'offline':''}>
                <Avatar name={m.name || m.email} size={22} ghost={m.is_ghost} />
              </span>
            ))}
            {group.members.length > 6 && <span className="text-xs text-neutral-500">+{group.members.length-6}</span>}
          </div>
        </div>
        <KebabMenu items={memberMenu} />
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">Expenses</h2>
            <button className="text-white bg-red-600 rounded-md px-3 py-1 text-sm disabled:opacity-50 flex items-center gap-2" disabled={!Object.values(selected).some(Boolean) || deleting} onClick={()=>setConfirmOpen(true)}>
              {deleting && <ButtonSpinner />}
              {deleting ? 'Deleting...' : 'Delete selected'}
            </button>
          </div>
          <ul className="space-y-2">
            {expenses.map(e => {
              const payer = group.members.find(m => m.user_id === e.created_by);
              return (
                <li key={e.id} className="border rounded-lg p-3 bg-white dark:bg-neutral-900 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={!!selected[e.id]} onChange={ev=>setSelected(s=>({ ...s, [e.id]: ev.target.checked }))} />
                    <div>
                      <div className="font-medium">{e.note || 'Expense'}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {new Date(e.date).toLocaleDateString()} • Paid by {payer?.name || 'Unknown'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-semibold">{currency(e.total_amount, e.currency)}</div>
                    <KebabMenu items={[{ label: 'Edit', onClick: ()=>{ setEditId(e.id); setEditOpen(true) } }, { label: 'Delete', destructive: true, onClick: ()=>deleteOne(e.id) }]} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="sm:col-span-1 space-y-4">
          <h2 className="font-medium mb-2">Add expense</h2>
          <form onSubmit={addExpense} className="space-y-2 border rounded-lg p-3 bg-white dark:bg-neutral-900">
            <input className="w-full border rounded-md px-3 py-2" placeholder="Note (optional)" value={note} onChange={e=>setNote(e.target.value)} />
            <input className={`w-full border rounded-md px-3 py-2 ${amountError?'border-red-500':''}`} placeholder={`Amount (${group.currency})`} value={amount} onChange={e=>setAmount(e.target.value)} />
            {amountError && <div className="text-xs text-red-600">{amountError}</div>}
            <div className="flex items-center gap-2 text-sm">
              <div className="text-neutral-600 w-24">Paid by</div>
              <select className="flex-1 border rounded-md px-2 py-1" value={paidBy} onChange={e=>setPaidBy(e.target.value)}>
                {group.members.map(m => (
                  <option key={m.member_id} value={m.user_id || ''}>{m.name || m.user_id}{m.is_ghost?' (offline)':''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-600">Splits</div>
                <div className="inline-flex rounded-md border overflow-hidden text-sm">
                  <button type="button" onClick={()=>setMode('equal')} className={mode==='equal'?"bg-neutral-900 text-white px-2 py-1":"px-2 py-1"}>Equal</button>
                  <button type="button" onClick={()=>setMode('amount')} className={mode==='amount'?"bg-neutral-900 text-white px-2 py-1":"px-2 py-1"}>Amount</button>
                  <button type="button" onClick={()=>setMode('percent')} className={mode==='percent'?"bg-neutral-900 text-white px-2 py-1":"px-2 py-1"}>Percent</button>
                </div>
              </div>
              {splits.map((s) => (
                <div key={s.member_id} className="flex items-center gap-2">
                  <div className="flex-1 text-sm flex items-center gap-1"><Avatar name={s.name} size={18} ghost={s.is_ghost} /> <span>{s.name}</span></div>
                  {mode==='percent' ? (
                    <div className="flex items-center gap-1">
                      <input className="w-24 border rounded-md px-2 py-1" value={s.share_percentage||''} onChange={e=>setSplits(prev=>prev.map(x=>x.member_id===s.member_id?{...x, share_percentage:Number(e.target.value||0)}:x))} />
                      <span className="text-sm text-neutral-600">%</span>
                    </div>
                  ) : (
                    <input className="w-28 border rounded-md px-2 py-1" value={s.share_amount} onChange={e=>updateSplit(s.member_id, e.target.value)} />
                  )}
                </div>
              ))}
              {mode==='percent' && (
                <div className="text-xs text-neutral-500">Percentages should sum to 100. Amounts will be computed from total.</div>
              )}
            </div>
            <button disabled={submitting} className="w-full bg-blue-600 text-white rounded-md py-2 disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting && <ButtonSpinner />}
              {submitting ? 'Adding...' : 'Add expense'}
            </button>
          </form>
          {balances && (
            <div className="mt-4 border rounded-lg p-3 bg-white dark:bg-neutral-900">
              <div className="font-medium mb-1">Balances</div>
              <ul className="text-sm space-y-1">
                {Object.entries(balances.balances).map(([key, bal]) => {
                  // key is either user_id or "ghost_<member_id>"
                  let member;
                  if (key.startsWith('ghost_')) {
                    const memberId = parseInt(key.replace('ghost_', ''));
                    member = group.members.find(m => m.member_id === memberId);
                  } else {
                    member = group.members.find(m => m.user_id === key);
                  }
                  const name = member?.name || key;
                  return (
                    <li key={key} className={bal>0?"text-green-700 dark:text-green-400":bal<0?"text-red-700 dark:text-red-400":"text-neutral-700 dark:text-neutral-300"}>
                      {name}{member?.is_ghost ? ' (offline)' : ''}: {currency(Math.abs(bal), group.currency)} {bal>0?"(owed)":bal<0?"(owes)":""}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </section>
      <ConfirmDialog open={confirmOpen} onClose={()=>setConfirmOpen(false)} title="Delete selected expenses?" message="This cannot be undone." confirmText="Delete" onConfirm={deleteSelected} />
      <EditExpenseModal open={editOpen} onClose={()=>setEditOpen(false)} expenseId={editId} accessToken={accessToken} currency={group.currency} onUpdated={refreshLists} />
      <AddMemberModal open={addMemberOpen} onClose={()=>setAddMemberOpen(false)} onAdd={addMembers} />
      <RemoveMemberModal open={removeMemberOpen} onClose={()=>setRemoveMemberOpen(false)} members={group.members} currentUserId={user?.id} onRemove={removeMember} />
    </div>
  )
}


