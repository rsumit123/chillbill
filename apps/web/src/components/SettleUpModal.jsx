import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { Avatar } from './Avatar.jsx'
import { Spinner, ButtonSpinner } from './Spinner.jsx'
import { api } from '../services/api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from './Toast.jsx'
import { buildPaymentUrl, canDeepLink, paymentMethodLabel } from '../services/payments.js'
import { detectRegion } from '../services/geo.js'
import DidThePaymentGoThroughSheet from './DidThePaymentGoThroughSheet.jsx'

function fmt(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount) }
  catch { return Number(amount).toFixed(2) }
}

function shareViaWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener')
}
function copyToClipboard(text) {
  try { navigator.clipboard?.writeText(text) } catch { /* noop */ }
}

const REGION_PREF = {
  IN: ['upi', 'paypal', 'venmo', 'cashapp'],
  US: ['paypal', 'venmo', 'cashapp', 'upi'],
  EU: ['paypal', 'venmo', 'cashapp', 'upi'],
  OTHER: ['paypal', 'venmo', 'cashapp', 'upi'],
}
function sortByRegion(methods, region) {
  const pref = REGION_PREF[region] || REGION_PREF.OTHER
  return [...methods].sort((a, b) => {
    const ai = pref.indexOf(a.type); const bi = pref.indexOf(b.type)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}
const region = detectRegion()

export default function SettleUpModal({ open, onClose, group, onSettled }) {
  const { accessToken } = useAuth()
  const { push } = useToast()
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [pendingId, setPendingId] = useState(null)
  const [sheet, setSheet] = useState(null)
  // sheet = { suggestion, methodType } | null

  useEffect(() => {
    if (!open || !group) return
    let mounted = true
    setLoading(true)
    api.get(`/groups/${group.id}/settlements/suggestions`, { token: accessToken })
      .then(s => { if (mounted) setSuggestions(s || []) })
      .catch(err => push(err.message || 'Failed to load suggestions', 'error'))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [open, group?.id])

  function memberById(id) {
    return group?.members?.find(m => m.member_id === id)
  }

  async function recordSettlement(s, viaMethod) {
    setPendingId(`${s.from_member_id}-${s.to_member_id}-${s.amount}`)
    try {
      await api.post(`/groups/${group.id}/settlements`, {
        from_member_id: s.from_member_id,
        to_member_id: s.to_member_id,
        amount: s.amount,
        via_payment_method: viaMethod || null,
      }, { token: accessToken })
      push('Settlement recorded', 'success')
      setSuggestions(prev => prev.filter(x =>
        !(x.from_member_id === s.from_member_id && x.to_member_id === s.to_member_id && Math.abs(x.amount - s.amount) < 0.005)
      ))
      onSettled?.()
    } catch (err) {
      push(err.message || 'Failed to record settlement', 'error')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Settle up</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">
          The fewest payments to zero everyone out. Tap <span className="font-medium">Mark as paid</span> when the money has actually moved.
        </p>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" className="text-blue-600" /></div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-2">🎉</div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Everyone is settled up.</div>
          </div>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((s, idx) => {
              const from = memberById(s.from_member_id)
              const to = memberById(s.to_member_id)
              const fromName = from?.name || `Member ${s.from_member_id}`
              const toName = to?.name || `Member ${s.to_member_id}`
              return (
                <li key={idx} className="border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-3">
                  <div className="flex items-center gap-2 min-w-0 mb-3">
                    <Avatar name={fromName} size={26} ghost={from?.is_ghost} />
                    <div className="text-sm text-neutral-900 dark:text-neutral-100 truncate">
                      <span className="font-medium">{fromName}</span>
                      <span className="text-neutral-400 mx-1">→</span>
                      <span className="font-medium">{toName}</span>
                    </div>
                    <Avatar name={toName} size={26} ghost={to?.is_ghost} />
                    <div className="ml-auto text-sm font-semibold text-neutral-900 dark:text-neutral-100 shrink-0">
                      {fmt(s.amount, group.currency)}
                    </div>
                  </div>

                  {(() => {
                    const recipient = memberById(s.to_member_id)
                    const methods = recipient?.payment_methods || []
                    const linkable = methods.filter(canDeepLink)
                    const nonLinkable = methods.filter(m => !canDeepLink(m))
                    const sorted = sortByRegion(linkable, region)
                    const primary = sorted[0]
                    const others = sorted.slice(1)
                    const anyPending = pendingId !== null || sheet !== null

                    function handleDeepLinkClick(m) {
                      const url = buildPaymentUrl(m, {
                        amount: s.amount,
                        currency: group.currency,
                        note: group.name,
                        payeeName: recipient?.name,
                      })
                      if (!url) {
                        push('This payment method does not support one-tap pay', 'error')
                        return
                      }
                      window.location.href = url
                      setSheet({ suggestion: { ...s }, methodType: m.type })
                    }

                    return (
                      <div className="space-y-2">
                        {primary && (
                          <button
                            type="button"
                            disabled={anyPending}
                            onClick={() => handleDeepLinkClick(primary)}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-3 py-2"
                          >
                            Pay via {paymentMethodLabel(primary.type)}
                          </button>
                        )}

                        {others.length > 0 && (
                          <details>
                            <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer select-none">Other ways</summary>
                            <div className="mt-2 space-y-2">
                              {others.map(m => (
                                <button key={m.type + m.value} type="button" disabled={anyPending}
                                  onClick={() => handleDeepLinkClick(m)}
                                  className="w-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-sm rounded-lg px-3 py-2"
                                >Pay via {paymentMethodLabel(m.type)}</button>
                              ))}
                            </div>
                          </details>
                        )}

                        {nonLinkable.length > 0 && (
                          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-2 space-y-2">
                            {nonLinkable.map(m => {
                              const shareText = `Settling our ${group.name} expenses — sending you ${fmt(s.amount, group.currency)} via ${paymentMethodLabel(m.type)}: ${m.value} — let me know once received 👍`
                              return (
                                <div key={m.type + m.value} className="text-xs">
                                  <div className="font-medium text-neutral-700 dark:text-neutral-300 mb-1">{paymentMethodLabel(m.type)}</div>
                                  <div className="font-mono text-neutral-600 dark:text-neutral-400 break-all">{m.value}</div>
                                  <div className="flex gap-2 mt-2">
                                    <button type="button" onClick={() => copyToClipboard(m.value)}
                                      className="bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">Copy</button>
                                    <button type="button" onClick={() => shareViaWhatsApp(shareText)}
                                      className="bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">Share via WhatsApp</button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={anyPending}
                          onClick={() => recordSettlement(s, 'manual')}
                          className="w-full text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg px-3 py-2"
                        >
                          {pendingId !== null ? 'Saving…' : 'Mark as paid'}
                        </button>

                        {methods.length === 0 && (
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            💡 Ask {recipient?.name || 'them'} to add a payment method for one-tap payments.
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="text-neutral-600 dark:text-neutral-300 px-4 py-2 text-sm">Close</button>
        </div>
      </div>

      <DidThePaymentGoThroughSheet
        open={sheet !== null}
        recipientName={sheet ? memberById(sheet.suggestion.to_member_id)?.name : ''}
        amountLabel={sheet ? fmt(sheet.suggestion.amount, group.currency) : ''}
        onYes={() => { recordSettlement(sheet.suggestion, sheet.methodType); setSheet(null) }}
        onNo={() => setSheet(null)}
      />
    </Modal>
  )
}
