import { describe, it, expect } from 'vitest'
import { buildPaymentUrl, paymentMethodLabel, canDeepLink } from '../../services/payments.js'

describe('buildPaymentUrl', () => {
  it('upi builds upi:// URL with all params', () => {
    const url = buildPaymentUrl(
      { type: 'upi', value: 'aarav@okicici' },
      { amount: 500, note: 'Goa Trip', payeeName: 'Aarav' }
    )
    expect(url).toContain('upi://pay')
    expect(url).toContain('pa=aarav%40okicici')
    expect(url).toContain('am=500')
    expect(url).toContain('cu=INR')
    expect(url).toContain('pn=Aarav')
    expect(url).toContain('tn=Goa%20Trip')
  })

  it('paypal builds paypal.me URL with amount', () => {
    const url = buildPaymentUrl(
      { type: 'paypal', value: 'paypal.me/aarav' },
      { amount: 30, currency: 'GBP' }
    )
    expect(url).toBe('https://paypal.me/aarav/30/GBP')
  })

  it('paypal handles bare username', () => {
    const url = buildPaymentUrl(
      { type: 'paypal', value: 'aarav' },
      { amount: 30, currency: 'USD' }
    )
    expect(url).toBe('https://paypal.me/aarav/30/USD')
  })

  it('venmo builds venmo:// URL', () => {
    const url = buildPaymentUrl(
      { type: 'venmo', value: '@aarav-123' },
      { amount: 25, note: 'dinner' }
    )
    expect(url).toContain('venmo://paycharge')
    expect(url).toContain('recipients=aarav-123')
    expect(url).toContain('amount=25')
    expect(url).toContain('note=dinner')
  })

  it('cashapp builds cash.app URL', () => {
    const url = buildPaymentUrl(
      { type: 'cashapp', value: '$aarav' },
      { amount: 25 }
    )
    expect(url).toBe('https://cash.app/$aarav/25')
  })

  it('iban returns null (no deep link)', () => {
    const url = buildPaymentUrl(
      { type: 'iban', value: 'GB29 NWBK 6016' },
      { amount: 100 }
    )
    expect(url).toBeNull()
  })

  it('other returns null', () => {
    expect(buildPaymentUrl({ type: 'other', value: 'x' }, { amount: 100 })).toBeNull()
  })
})

describe('canDeepLink', () => {
  it('true for upi/paypal/venmo/cashapp', () => {
    for (const t of ['upi', 'paypal', 'venmo', 'cashapp']) {
      expect(canDeepLink({ type: t, value: 'x' })).toBe(true)
    }
  })

  it('false for iban/other', () => {
    for (const t of ['iban', 'other']) {
      expect(canDeepLink({ type: t, value: 'x' })).toBe(false)
    }
  })
})

describe('paymentMethodLabel', () => {
  it('returns user-facing label per type', () => {
    expect(paymentMethodLabel('upi')).toBe('UPI')
    expect(paymentMethodLabel('paypal')).toBe('PayPal')
    expect(paymentMethodLabel('venmo')).toBe('Venmo')
    expect(paymentMethodLabel('cashapp')).toBe('Cash App')
    expect(paymentMethodLabel('iban')).toBe('IBAN')
    expect(paymentMethodLabel('other')).toBe('Payment info')
  })
})
