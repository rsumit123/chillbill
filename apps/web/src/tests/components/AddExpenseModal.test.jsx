import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AddExpenseModal from '../../components/AddExpenseModal.jsx'

vi.mock('../../services/api.js', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => ({ push: vi.fn() }) }))
vi.mock('../../components/Modal.jsx', () => ({
  default: ({ children, open }) => open ? <div>{children}</div> : null,
}))
vi.mock('../../components/Spinner.jsx', () => ({
  ButtonSpinner: () => <span data-testid="spinner" />,
  Spinner: () => <span data-testid="spinner" />,
}))
vi.mock('../../components/Avatar.jsx', () => ({
  Avatar: ({ name }) => <span data-testid="avatar">{name}</span>,
}))
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ accessToken: 'tok' }),
}))

import { api } from '../../services/api.js'

const GROUP = {
  id: 'g1',
  currency: 'INR',
  members: [
    { member_id: 1, name: 'Alice', is_ghost: false },
    { member_id: 2, name: 'Bob',   is_ghost: false },
  ],
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  group: GROUP,
  user: { id: 'u1' },
  onSubmit: vi.fn().mockResolvedValue({}),
  submitting: false,
}

describe('AddExpenseModal — Repeat monthly', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset()
    vi.mocked(api.post).mockResolvedValue({})
    vi.mocked(defaultProps.onSubmit).mockReset()
    vi.mocked(defaultProps.onSubmit).mockResolvedValue({})
  })

  it('renders the Repeat monthly checkbox', async () => {
    render(<AddExpenseModal {...defaultProps} />)
    expect(await screen.findByLabelText(/repeat monthly/i)).toBeInTheDocument()
  })

  it('checkbox starts unchecked', async () => {
    render(<AddExpenseModal {...defaultProps} />)
    const cb = await screen.findByLabelText(/repeat monthly/i)
    expect(cb).not.toBeChecked()
  })

  it('save without checkbox does NOT hit /recurring-rules', async () => {
    render(<AddExpenseModal {...defaultProps} />)
    // Fill amount to pass validation
    const amountInput = await screen.findByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '100' } })
    const saveBtn = await screen.findByRole('button', { name: /add expense/i })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      const urls = vi.mocked(api.post).mock.calls.map(c => c[0])
      expect(urls.some(u => String(u).includes('recurring-rules'))).toBe(false)
    })
  })

  it('save with checkbox posts to /recurring-rules with day_of_month + start_from_next_month', async () => {
    render(<AddExpenseModal {...defaultProps} />)
    // Fill amount to pass validation
    const amountInput = await screen.findByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '100' } })
    // Check the repeat checkbox
    const cb = await screen.findByLabelText(/repeat monthly/i)
    fireEvent.click(cb)
    const saveBtn = await screen.findByRole('button', { name: /add expense/i })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      const rrCall = vi.mocked(api.post).mock.calls.find(c => String(c[0]).includes('recurring-rules'))
      expect(rrCall).toBeDefined()
      expect(rrCall[1].start_from_next_month).toBe(true)
      expect(typeof rrCall[1].day_of_month).toBe('number')
    })
  })
})
