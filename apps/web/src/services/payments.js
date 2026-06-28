// Build deep-link URLs for various payment providers.
// Returns null for types that don't support deep linking (caller uses copy + share fallback).

const LABELS = {
  upi: 'UPI',
  paypal: 'PayPal',
  venmo: 'Venmo',
  cashapp: 'Cash App',
  iban: 'IBAN',
  other: 'Payment info',
}

const DEEP_LINK_TYPES = new Set(['upi', 'paypal', 'venmo', 'cashapp'])

export function paymentMethodLabel(type) {
  return LABELS[type] || type
}

export function canDeepLink(method) {
  return DEEP_LINK_TYPES.has(method.type)
}

export function buildPaymentUrl(method, { amount, currency = 'INR', note = '', payeeName = '' } = {}) {
  if (!canDeepLink(method)) return null
  const amt = String(Number(amount).toFixed(2)).replace(/\.00$/, '')

  switch (method.type) {
    case 'upi': {
      const params = new URLSearchParams()
      params.set('pa', method.value)
      if (payeeName) params.set('pn', payeeName)
      params.set('am', amt)
      params.set('cu', 'INR')
      if (note) params.set('tn', note)
      return `upi://pay?${params.toString().replace(/\+/g, '%20')}`
    }
    case 'paypal': {
      const user = String(method.value).replace(/^paypal\.me\//i, '').replace(/^@/, '')
      const safeCurrency = (currency || 'USD').toUpperCase()
      return `https://paypal.me/${encodeURIComponent(user)}/${amt}/${safeCurrency}`
    }
    case 'venmo': {
      const recipients = String(method.value).replace(/^@/, '')
      const params = new URLSearchParams()
      params.set('txn', 'pay')
      params.set('recipients', recipients)
      params.set('amount', amt)
      if (note) params.set('note', note)
      return `venmo://paycharge?${params.toString()}`
    }
    case 'cashapp': {
      const user = String(method.value).startsWith('$')
        ? method.value
        : `$${method.value}`
      return `https://cash.app/${user}/${amt}`
    }
    default:
      return null
  }
}
