// Lightweight client-side region detection for tailoring payment-method prompts.
// Not authoritative — a user can always pick a different region in the UI.

export function detectRegion() {
  let tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { /* noop */ }
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US'

  if (tz === 'Asia/Kolkata' || lang.endsWith('-IN')) return 'IN'
  if (lang.endsWith('-US') || tz.startsWith('America/')) return 'US'
  if (lang.endsWith('-GB') || lang.endsWith('-IE') || tz.startsWith('Europe/')) return 'EU'
  return 'OTHER'
}

export const SUGGESTED_METHODS = {
  IN: [
    { type: 'upi',    label: 'UPI ID',       placeholder: 'you@okicici' },
  ],
  US: [
    { type: 'paypal', label: 'PayPal',       placeholder: 'paypal.me/yourname' },
    { type: 'venmo',  label: 'Venmo',        placeholder: '@your-handle' },
    { type: 'cashapp',label: 'Cash App',     placeholder: '$yourname' },
  ],
  EU: [
    { type: 'paypal', label: 'PayPal',       placeholder: 'paypal.me/yourname' },
    { type: 'iban',   label: 'IBAN',         placeholder: 'GB29 NWBK 6016 ...' },
  ],
  OTHER: [
    { type: 'other',  label: 'Payment info', placeholder: 'PayPal, bank tag, etc.' },
  ],
}

// All possible types for the "show all options" expander.
export const ALL_METHOD_TYPES = [
  { type: 'upi',    label: 'UPI ID',       placeholder: 'you@okicici' },
  { type: 'paypal', label: 'PayPal',       placeholder: 'paypal.me/yourname' },
  { type: 'venmo',  label: 'Venmo',        placeholder: '@your-handle' },
  { type: 'cashapp',label: 'Cash App',     placeholder: '$yourname' },
  { type: 'iban',   label: 'IBAN',         placeholder: 'GB29 NWBK 6016 ...' },
  { type: 'other',  label: 'Payment info', placeholder: 'PayPal, bank tag, etc.' },
]
