// Using INR as base currency with fallback rates
let cached = { 
  at: 0, 
  base: 'INR',
  rates: { INR: 1, USD: 84.0, EUR: 90.0, GBP: 105.0, THB: 2.4, CAD: 62.0, AUD: 55.0, JPY: 0.56 },
  lastUpdated: null
}
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// Free API: https://exchangerate-api.com (1,500 requests/month free)
// Returns rates with USD as base, we'll convert to INR base
async function fetchRates() {
  try {
    // Try custom URL first (if user configures their own)
    const customUrl = import.meta.env.VITE_FX_RATES_URL
    if (customUrl) {
      console.log('[FX] Trying custom URL:', customUrl)
      const res = await fetch(customUrl)
      if (res.ok) {
        const data = await res.json()
        if (data && data.rates) {
          cached = { 
            at: Date.now(), 
            base: data.base || 'INR',
            rates: data.rates,
            lastUpdated: data.time_last_update_utc || new Date().toISOString()
          }
          console.log('[FX] ✓ Loaded rates from custom URL')
          return cached.rates
        }
      }
    }

    // Fallback to exchangerate-api.com (free, no API key needed for basic usage)
    // Gets rates with USD as base
    console.log('[FX] Fetching live rates from exchangerate-api.com...')
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) {
      console.warn('[FX] API request failed:', res.status)
      return cached.rates
    }
    
    const data = await res.json()
    if (data && data.rates) {
      // Convert from USD base to INR base
      const usdToInr = data.rates.INR || 84.0
      const inrBasedRates = {}
      
      // For each currency, calculate its rate to INR
      for (const [curr, rate] of Object.entries(data.rates)) {
        if (curr === 'INR') {
          inrBasedRates[curr] = 1
        } else {
          // How much INR for 1 unit of currency
          // Example: 1 USD = 84 INR means USD rate to INR is 84
          inrBasedRates[curr] = usdToInr / rate
        }
      }
      
      cached = { 
        at: Date.now(), 
        base: 'INR',
        rates: inrBasedRates,
        lastUpdated: data.time_last_update_utc || new Date().toISOString()
      }
      console.log('[FX] ✓ Live rates loaded successfully. Updated:', cached.lastUpdated)
    }
  } catch (err) {
    console.warn('[FX] Failed to fetch exchange rates, using cached/fallback:', err.message)
  }
  return cached.rates
}

export async function getRates() {
  if (Date.now() - cached.at > TTL_MS) {
    await fetchRates()
  }
  return cached.rates
}

export function getRatesInfo() {
  return {
    base: cached.base,
    rates: cached.rates,
    lastUpdated: cached.lastUpdated,
    isFallback: cached.at === 0
  }
}

export async function forceRefreshRates() {
  console.log('[FX] Force refreshing rates...')
  cached.at = 0 // Reset cache timestamp
  return await getRates()
}

export async function convert(amount, from = 'INR', to = 'INR') {
  if (from === to) return amount
  const rates = await getRates()
  const fromRate = rates[from] ?? 1
  const toRate = rates[to] ?? 1
  // rates are quoted to INR; convert via INR
  const inInr = amount * (from === 'INR' ? 1 : (rates[from] || 1))
  if (to === 'INR') return inInr
  // amount in target = INR amount / rate[target]
  return inInr / toRate
}

export async function toINR(amount, from = 'INR') {
  return convert(amount, from, 'INR')
}


