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

function currency(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount) } catch { return amount.toFixed(2) }
}

export default function GroupDetailPage() {
  const { accessToken } = useAuth()
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
          setSplits(g.members.map(m => ({ user_id: m.user_id, share_amount: 0, name: m.name || m.user_id, is_ghost: m.is_ghost })))
          setPaidBy(g.members[0]?.user_id || '')
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
    setSplits(group.members.map(m => ({ user_id: m.user_id, name: m.name || m.user_id, share_amount: per, is_ghost: m.is_ghost })))
  }, [group?.members?.length, total, mode])

  function updateSplit(userId, value) {
    const val = Number(value || 0)
    setSplits(prev => prev.map(s => s.user_id === userId ? { ...s, share_amount: val } : s))
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
    const payload = {
      total_amount: total,
      currency: group.currency,
      note: note || null,
      date: new Date().toISOString(),
      paid_by: paidBy || undefined,
      splits: mode==='percent'
        ? splits.map(s => ({ user_id: s.user_id, share_amount: +(total * (Number(s.share_percentage||0)/100)).toFixed(2), share_percentage: Number(s.share_percentage||0) }))
        : splits.map(s => ({ user_id: s.user_id, share_amount: Number(s.share_amount||0), share_percentage: null })),
    }
    await api.post(`/groups/${groupId}/expenses`, payload, { token: accessToken })
    setNote('')
    setAmount('')
    await refreshLists()
  }

  async function addMembers(tokens) {
    await Promise.allSettled(tokens.map(t => /.+@.+\..+/.test(t) ? api.post(`/groups/${groupId}/members`, { email: t }, { token: accessToken }) : api.post(`/groups/${groupId}/members`, { name: t }, { token: accessToken })))
    await refreshLists()
  }

  async function deleteSelected() {
    const ids = Object.entries(selected).filter(([,v])=>v).map(([k])=>k)
    await Promise.allSettled(ids.map(id => api.del(`/groups/expenses/${id}`, { token: accessToken })))
    setSelected({})
    await refreshLists()
  }

  async function deleteOne(id) {
    await api.del(`/groups/expenses/${id}`, { token: accessToken })
    await refreshLists()
  }

  if (loading) return <div>Loading...</div>
  if (error) return <div className="text-red-600">{error}</div>
  if (!group) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Icon id={group.icon || 'group'} /> {group.name}</h1>
          <div className="text-neutral-600 flex items-center gap-1 mt-1">
            {group.members.slice(0,6).map(m => (<Avatar key={m.user_id || m.name} name={m.name || m.email} size={22} ghost={m.is_ghost} />))}
            {group.members.length > 6 && <span className="text-xs text-neutral-500">+{group.members.length-6}</span>}
          </div>
        </div>
        <KebabMenu items={[{ label: 'Add member', onClick: ()=>setAddMemberOpen(true) }]} />
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">Expenses</h2>
            <button className="text-white bg-red-600 rounded-md px-3 py-1 text-sm disabled:opacity-50" disabled={!Object.values(selected).some(Boolean)} onClick={()=>setConfirmOpen(true)}>Delete selected</button>
          </div>
          <ul className="space-y-2">
            {expenses.map(e => (
              <li key={e.id} className="border rounded-lg p-3 bg-white dark:bg-neutral-900 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={!!selected[e.id]} onChange={ev=>setSelected(s=>({ ...s, [e.id]: ev.target.checked }))} />
                  <div>
                    <div className="font-medium">{e.note || 'Expense'}</div>
                    <div className="text-sm text-neutral-500">{new Date(e.date).toLocaleString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-semibold">{currency(e.total_amount, e.currency)}</div>
                  <KebabMenu items={[{ label: 'Edit', onClick: ()=>{ setEditId(e.id); setEditOpen(true) } }, { label: 'Delete', destructive: true, onClick: ()=>deleteOne(e.id) }]} />
                </div>
              </li>
            ))}
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
                  <option key={m.user_id || m.name} value={m.user_id || ''}>{m.name || m.user_id}{m.is_ghost?' (offline)':''}</option>
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
                <div key={s.user_id || s.name} className="flex items-center gap-2">
                  <div className="flex-1 text-sm flex items-center gap-1"><Avatar name={s.name} size={18} ghost={s.is_ghost} /> <span>{s.name}</span></div>
                  {mode==='percent' ? (
                    <div className="flex items-center gap-1">
                      <input className="w-24 border rounded-md px-2 py-1" value={s.share_percentage||''} onChange={e=>setSplits(prev=>prev.map(x=>x.user_id===s.user_id?{...x, share_percentage:Number(e.target.value||0)}:x))} />
                      <span className="text-sm text-neutral-600">%</span>
                    </div>
                  ) : (
                    <input className="w-28 border rounded-md px-2 py-1" value={s.share_amount} onChange={e=>updateSplit(s.user_id, e.target.value)} />
                  )}
                </div>
              ))}
              {mode==='percent' && (
                <div className="text-xs text-neutral-500">Percentages should sum to 100. Amounts will be computed from total.</div>
              )}
            </div>
            <button className="w-full bg-blue-600 text-white rounded-md py-2">Add</button>
          </form>
          {balances && (
            <div className="mt-4 border rounded-lg p-3 bg-white">
              <div className="font-medium mb-1">Balances</div>
              <ul className="text-sm space-y-1">
                {Object.entries(balances.balances).map(([uid, bal]) => (
                  <li key={uid} className={bal>0?"text-green-700":bal<0?"text-red-700":"text-neutral-700"}>
                    {(group.members.find(m=>m.user_id===uid)?.name) || uid}: {currency(Math.abs(bal), group.currency)} {bal>0?"(owed)":bal<0?"(owes)":""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      <ConfirmDialog open={confirmOpen} onClose={()=>setConfirmOpen(false)} title="Delete selected expenses?" message="This cannot be undone." confirmText="Delete" onConfirm={deleteSelected} />
      <EditExpenseModal open={editOpen} onClose={()=>setEditOpen(false)} expenseId={editId} accessToken={accessToken} currency={group.currency} onUpdated={refreshLists} />
      <AddMemberModal open={addMemberOpen} onClose={()=>setAddMemberOpen(false)} onAdd={addMembers} />
    </div>
  )
}


