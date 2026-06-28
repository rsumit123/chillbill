import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectRegion, SUGGESTED_METHODS } from '../../services/geo.js'

describe('detectRegion', () => {
  const originalTZ = Intl.DateTimeFormat
  let mockedLanguage = 'en-US'

  beforeEach(() => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'Asia/Kolkata' }),
    }))
    Object.defineProperty(navigator, 'language', {
      get: () => mockedLanguage,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns IN for Asia/Kolkata timezone', () => {
    expect(detectRegion()).toBe('IN')
  })

  it('returns IN for en-IN language even with non-Indian tz', () => {
    Intl.DateTimeFormat.mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'America/New_York' }),
    }))
    mockedLanguage = 'en-IN'
    expect(detectRegion()).toBe('IN')
  })

  it('returns US for America/* tz', () => {
    Intl.DateTimeFormat.mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'America/Los_Angeles' }),
    }))
    mockedLanguage = 'en-US'
    expect(detectRegion()).toBe('US')
  })

  it('returns EU for Europe/* tz', () => {
    Intl.DateTimeFormat.mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'Europe/London' }),
    }))
    mockedLanguage = 'en-GB'
    expect(detectRegion()).toBe('EU')
  })

  it('returns OTHER for anything unrecognized', () => {
    Intl.DateTimeFormat.mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'Pacific/Auckland' }),
    }))
    mockedLanguage = 'en-NZ'
    expect(detectRegion()).toBe('OTHER')
  })
})

describe('SUGGESTED_METHODS', () => {
  it('has an array for each region', () => {
    for (const r of ['IN', 'US', 'EU', 'OTHER']) {
      expect(Array.isArray(SUGGESTED_METHODS[r])).toBe(true)
      expect(SUGGESTED_METHODS[r].length).toBeGreaterThan(0)
    }
  })

  it('IN suggests upi first', () => {
    expect(SUGGESTED_METHODS.IN[0].type).toBe('upi')
  })

  it('every suggested method has type, label, placeholder', () => {
    for (const r of ['IN', 'US', 'EU', 'OTHER']) {
      for (const m of SUGGESTED_METHODS[r]) {
        expect(m).toHaveProperty('type')
        expect(m).toHaveProperty('label')
        expect(m).toHaveProperty('placeholder')
      }
    }
  })
})
