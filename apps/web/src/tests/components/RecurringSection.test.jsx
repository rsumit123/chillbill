import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import RecurringSection from '../../components/RecurringSection.jsx'

vi.mock('../../services/api.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), del: vi.fn() },
}))
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => ({ push: vi.fn() }) }))

import { api } from '../../services/api.js'

const RULES_ONE_ACTIVE = { rules: [
  { id: 1, note: 'Rent', total_amount: 15000, currency: 'INR', day_of_month: 1, splits: [{member_id:1},{member_id:2}], is_active: true, paused_reason: null },
]}
const RULES_ONE_PAUSED = { rules: [
  { id: 2, note: 'Netflix', total_amount: 200, currency: 'INR', day_of_month: 15, splits: [{member_id:1},{member_id:2}], is_active: false, paused_reason: 'Member no longer in group (id=7)' },
]}

describe('RecurringSection', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.del).mockReset()
  })

  it('renders nothing when there are no rules', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ rules: [] })
    const { container } = render(<RecurringSection groupId="g" currency="INR" accessToken="t" />)
    await waitFor(() => expect(vi.mocked(api.get)).toHaveBeenCalled())
    expect(container.textContent).not.toContain('Recurring')
  })

  it('renders active rule with pause button', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(RULES_ONE_ACTIVE)
    render(<RecurringSection groupId="g" currency="INR" accessToken="t" />)
    await waitFor(() => expect(screen.getByText('Rent')).toBeInTheDocument())
    expect(screen.getByText(/Pause/)).toBeInTheDocument()
  })

  it('renders paused rule with reason + Resume button', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(RULES_ONE_PAUSED)
    render(<RecurringSection groupId="g" currency="INR" accessToken="t" />)
    await waitFor(() => expect(screen.getByText('Netflix')).toBeInTheDocument())
    expect(screen.getByText(/Member no longer in group/)).toBeInTheDocument()
    expect(screen.getByText(/Resume/)).toBeInTheDocument()
  })

  it('clicking Pause fires the pause endpoint and reloads', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(RULES_ONE_ACTIVE).mockResolvedValueOnce({ rules: [] })
    vi.mocked(api.post).mockResolvedValueOnce({})
    render(<RecurringSection groupId="g" currency="INR" accessToken="t" />)
    await waitFor(() => expect(screen.getByText('Rent')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Pause/))
    await waitFor(() =>
      expect(vi.mocked(api.post)).toHaveBeenCalledWith('/groups/g/recurring-rules/1/pause', {}, { token: 't' })
    )
  })

  it('clicking Delete confirms then fires DELETE', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(RULES_ONE_ACTIVE).mockResolvedValueOnce({ rules: [] })
    vi.mocked(api.del).mockResolvedValueOnce({})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RecurringSection groupId="g" currency="INR" accessToken="t" />)
    await waitFor(() => expect(screen.getByText('Rent')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Delete/))
    await waitFor(() =>
      expect(vi.mocked(api.del)).toHaveBeenCalledWith('/groups/g/recurring-rules/1', { token: 't' })
    )
  })
})
