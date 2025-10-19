import { useEffect, useState } from 'react'
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
import AddExpenseModal from '../components/AddExpenseModal.jsx'
import { Spinner, ButtonSpinner } from '../components/Spinner.jsx'
import { useToast } from '../components/Toast.jsx'

function currency(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount) } catch { return amount.toFixed(2) }
}

export default function GroupDetailPage() {
  const { accessToken, user } = useAuth()
  const { groupId } = useParams()
  const { push } = useToast()
  const [group, setGroup] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [balances, setBalances] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [removeMemberOpen, setRemoveMemberOpen] = useState(false)
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
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
        }
      } catch (e) { if (mounted) setError(e.message) } finally { if (mounted) setLoading(false) }
    }
    load()
    return () => { mounted = false }
  }, [groupId, accessToken])


  async function refreshLists() {
    const ex = await api.get(`/groups/${groupId}/expenses`, { token: accessToken })
    setExpenses(ex)
    const bal = await api.get(`/groups/${groupId}/balances`, { token: accessToken })
    setBalances(bal)
    const g = await api.get(`/groups/${groupId}`, { token: accessToken })
    setGroup(g)
  }

  async function addExpense({ note, amount, paidByMemberId, splits, mode }) {
    const total = Number(amount)
    setSubmitting(true)
    try {
      const payload = {
        total_amount: total,
        currency: group.currency,
        note: note || null,
        date: new Date().toISOString(),
        paid_by_member_id: paidByMemberId, // Send member_id directly
        splits: mode==='percent'
          ? splits.map(s => ({ member_id: s.member_id, share_amount: +(total * (Number(s.share_percentage||0)/100)).toFixed(2), share_percentage: Number(s.share_percentage||0) }))
          : splits.map(s => ({ member_id: s.member_id, share_amount: Number(s.share_amount||0), share_percentage: null })),
      }
      await api.post(`/groups/${groupId}/expenses`, payload, { token: accessToken })
      await refreshLists()
      setAddExpenseOpen(false)
      push('Expense added successfully', 'success')
    } catch (err) {
      push(err.message || 'Failed to add expense', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function addMembers(tokens) {
    try {
      await Promise.allSettled(tokens.map(t => /.+@.+\..+/.test(t) ? api.post(`/groups/${groupId}/members`, { email: t }, { token: accessToken }) : api.post(`/groups/${groupId}/members`, { name: t }, { token: accessToken })))
      await refreshLists()
      push(`${tokens.length} member(s) added successfully`, 'success')
    } catch (err) {
      push(err.message || 'Failed to add members', 'error')
    }
  }

  async function removeMember(memberId) {
    try {
      await api.del(`/groups/${groupId}/members/${memberId}`, { token: accessToken })
      await refreshLists()
      push('Member removed successfully', 'success')
    } catch (err) {
      push(err.message || 'Failed to remove member', 'error')
    }
  }

  async function deleteSelected() {
    setDeleting(true)
    try {
      const ids = Object.entries(selected).filter(([,v])=>v).map(([k])=>k)
      await Promise.allSettled(ids.map(id => api.del(`/groups/expenses/${id}`, { token: accessToken })))
      setSelected({})
      await refreshLists()
      push(`${ids.length} expense(s) deleted successfully`, 'success')
    } catch (err) {
      push(err.message || 'Failed to delete expenses', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function deleteOne(id) {
    try {
      await api.del(`/groups/expenses/${id}`, { token: accessToken })
      await refreshLists()
      push('Expense deleted successfully', 'success')
    } catch (err) {
      push(err.message || 'Failed to delete expense', 'error')
    }
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
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Icon id={group.icon || 'group'} /> {group.name}</h1>
          <div className="text-neutral-600 dark:text-neutral-400 flex items-center gap-1 mt-1">
            {group.members.slice(0,6).map(m => (
              <span key={m.member_id} title={m.is_ghost?'offline':''}>
                <Avatar name={m.name || m.email} size={22} ghost={m.is_ghost} />
              </span>
            ))}
            {group.members.length > 6 && <span className="text-xs text-neutral-500 dark:text-neutral-400">+{group.members.length-6}</span>}
          </div>
        </div>
        <KebabMenu items={memberMenu} />
      </div>

      {/* Balances Section - Enhanced Design */}
      {balances && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
          <h2 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-3">Group Balances</h2>
          <div className="grid gap-2">
            {Object.entries(balances.balances).map(([key, bal]) => {
              let member;
              if (key.startsWith('ghost_')) {
                const memberId = parseInt(key.replace('ghost_', ''));
                member = group.members.find(m => m.member_id === memberId);
              } else {
                member = group.members.find(m => m.user_id === key);
              }
              const name = member?.name || key;
              const isPositive = bal > 0;
              const isNegative = bal < 0;
              return (
                <div key={key} className="flex items-center justify-between bg-white/60 dark:bg-neutral-800/60 backdrop-blur rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={name} size={24} ghost={member?.is_ghost} />
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{name}</span>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${isPositive?'text-green-700 dark:text-green-400':isNegative?'text-red-700 dark:text-red-400':'text-neutral-700 dark:text-neutral-300'}`}>
                      {currency(Math.abs(bal), group.currency)}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{isPositive?'is owed':isNegative?'owes':'settled'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expenses Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">Expenses</h2>
          <button 
            className="text-white bg-red-600 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all hover:bg-red-700" 
            disabled={!Object.values(selected).some(Boolean) || deleting} 
            onClick={()=>setConfirmOpen(true)}
          >
            {deleting && <ButtonSpinner />}
            {deleting ? 'Deleting...' : 'Delete selected'}
          </button>
        </div>
        
        {expenses.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl border-neutral-300 dark:border-neutral-700">
            <div className="text-4xl mb-3">💸</div>
            <div className="text-neutral-600 dark:text-neutral-400 text-sm">No expenses yet</div>
            <div className="text-neutral-500 dark:text-neutral-500 text-xs mt-1">Click the + button below to add one</div>
          </div>
        ) : (
          <ul className="space-y-2">
            {expenses.map(e => {
              const payer = group.members.find(m => m.user_id === e.created_by);
              // Get participants from member_ids
              const participants = e.participant_member_ids 
                ? e.participant_member_ids.map(mid => group.members.find(m => m.member_id === mid)).filter(Boolean)
                : [];
              return (
                <li key={e.id} className="border dark:border-neutral-700 rounded-xl p-4 bg-white dark:bg-neutral-900 flex items-center justify-between gap-3 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input 
                      type="checkbox" 
                      checked={!!selected[e.id]} 
                      onChange={ev=>setSelected(s=>({ ...s, [e.id]: ev.target.checked }))} 
                      className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">{e.note || 'Expense'}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span>{new Date(e.date).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Avatar name={payer?.name || 'Unknown'} size={14} ghost={payer?.is_ghost} />
                            Paid by {payer?.name || 'Unknown'}
                          </span>
                        </div>
                        {participants.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-neutral-400">Split:</span>
                            <div className="flex items-center -space-x-1">
                              {participants.slice(0, 4).map((p, idx) => (
                                <div key={p.member_id} style={{ zIndex: 10 - idx }} title={p.name || p.user_id}>
                                  <Avatar name={p.name || p.user_id} size={18} ghost={p.is_ghost} />
                                </div>
                              ))}
                              {participants.length > 4 && (
                                <div className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-[10px] flex items-center justify-center text-neutral-600 dark:text-neutral-300 font-medium border border-white dark:border-neutral-900">
                                  +{participants.length - 4}
                                </div>
                              )}
                            </div>
                            <span className="text-neutral-400">({participants.length})</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100 whitespace-nowrap">{currency(e.total_amount, e.currency)}</div>
                    <KebabMenu items={[
                      { label: 'Edit', onClick: ()=>{ setEditId(e.id); setEditOpen(true) } }, 
                      { label: 'Delete', destructive: true, onClick: ()=>deleteOne(e.id) }
                    ]} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => setAddExpenseOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40 group"
        aria-label="Add expense"
      >
        <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Modals */}
      <ConfirmDialog open={confirmOpen} onClose={()=>setConfirmOpen(false)} title="Delete selected expenses?" message="This cannot be undone." confirmText="Delete" onConfirm={deleteSelected} />
      <EditExpenseModal open={editOpen} onClose={()=>setEditOpen(false)} expenseId={editId} accessToken={accessToken} currency={group.currency} onUpdated={refreshLists} />
      <AddExpenseModal open={addExpenseOpen} onClose={()=>setAddExpenseOpen(false)} group={group} user={user} onSubmit={addExpense} submitting={submitting} />
      <AddMemberModal open={addMemberOpen} onClose={()=>setAddMemberOpen(false)} onAdd={addMembers} />
      <RemoveMemberModal open={removeMemberOpen} onClose={()=>setRemoveMemberOpen(false)} members={group.members} currentUserId={user?.id} onRemove={removeMember} />
    </div>
  )
}


