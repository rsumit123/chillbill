let cached = { at: 0, rates: { INR: 1, USD: 84.0, EUR: 90.0 } } // fallback INR base
const TTL_MS = 12 * 60 * 60 * 1000

async function fetchRates() {
  const url = import.meta.env.VITE_FX_RATES_URL // expected: { base: "INR", rates: { USD: x, EUR: y, INR: 1 } }
  if (!url) return cached.rates
  try {
    const res = await fetch(url)
    if (!res.ok) return cached.rates
    const data = await res.json()
    if (data && data.rates && data.rates.INR === 1) {
      cached = { at: Date.now(), rates: data.rates }
    }
  } catch (_) {}
  return cached.rates
}

export async function getRates() {
  if (Date.now() - cached.at > TTL_MS) {
    await fetchRates()
  }
  return cached.rates
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


