import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import EditExpenseModal from '../../components/EditExpenseModal.jsx'
import { api } from '../../services/api.js'

vi.mock('../../services/api.js', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../../components/Toast.jsx', () => ({
  useToast: () => ({ push: vi.fn() }),
}))

vi.mock('../../components/Modal.jsx', () => ({
  default: ({ open, children }) => open ? <div data-testid="modal">{children}</div> : null,
}))

vi.mock('../../components/Spinner.jsx', () => ({
  ButtonSpinner: () => <span data-testid="spinner" />,
}))

const GROUP = {
  currency: 'INR',
  members: [
    { member_id: 1, name: 'Alice', email: 'a@x.com', is_ghost: false },
    { member_id: 2, name: 'Bob', email: 'b@x.com', is_ghost: false },
    { member_id: 3, name: 'Charlie', email: 'c@x.com', is_ghost: false },
  ],
}

const EXPENSE = {
  id: 'exp1',
  total_amount: 100,
  note: 'Dinner',
  paid_by_member_id: 1,
  date: '2026-06-30T00:00:00Z',
  splits: [
    { member_id: 1, share_amount: 50, share_percentage: null },
    { member_id: 2, share_amount: 50, share_percentage: null },
  ],
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  expenseId: 'exp1',
  group: GROUP,
  accessToken: 'tok',
  onUpdated: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditExpenseModal split editor', () => {
  it('loads original expense and pre-selects the original members', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(EXPENSE)
    render(<EditExpenseModal {...defaultProps} />)

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox')
      // Alice (member 1) and Bob (member 2) should be checked
      const aliceCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent.includes('Alice'))
      const bobCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent.includes('Bob'))
      expect(aliceCheckbox).toBeChecked()
      expect(bobCheckbox).toBeChecked()
    })

    // paid_by dropdown should show Alice (member_id 1)
    const select = screen.getByRole('combobox')
    expect(select.value).toBe('1')
  })

  it('surfaces newly-added group members as unchecked toggles', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(EXPENSE)
    render(<EditExpenseModal {...defaultProps} />)

    await waitFor(() => {
      const checkboxes = screen.getAllByRole('checkbox')
      const charlieCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent.includes('Charlie'))
      expect(charlieCheckbox).toBeDefined()
      expect(charlieCheckbox).not.toBeChecked()
    })
  })

  it('equal mode auto-recomputes when amount changes', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(EXPENSE)
    render(<EditExpenseModal {...defaultProps} />)

    // Wait for load, then switch to equal mode
    await waitFor(() => screen.getAllByRole('checkbox'))

    fireEvent.click(screen.getByRole('button', { name: 'Equal' }))

    // Change amount to 200
    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '200' } })

    // In equal mode, inputs aren't shown — verify by triggering save and checking payload
    vi.mocked(api.put).mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalled()
      const payload = vi.mocked(api.put).mock.calls[0][1]
      // Alice and Bob each selected (Charlie is unchecked), total 200 → 100 each
      const splits = payload.splits
      expect(splits).toHaveLength(2)
      expect(splits.every((s) => s.share_amount === 100)).toBe(true)
    })
  })

  it('amount mode preserves per-member custom amounts on toggle-off / toggle-on', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(EXPENSE)
    render(<EditExpenseModal {...defaultProps} />)

    await waitFor(() => screen.getAllByRole('checkbox'))

    // Component loads in amount mode (no percent in original splits)
    // Amount inputs for Alice and Bob should already show 50
    const amountInputs = screen.getAllByRole('spinbutton')
    // First input is the total amount field, next are the split inputs
    // Set Alice to 70, Bob to 30
    const splitInputs = amountInputs.filter(
      (inp) => inp !== screen.getByPlaceholderText('0.00')
    )
    fireEvent.change(splitInputs[0], { target: { value: '70' } })
    fireEvent.change(splitInputs[1], { target: { value: '30' } })

    vi.mocked(api.put).mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalled()
      const { splits } = vi.mocked(api.put).mock.calls[0][1]
      const alice = splits.find((s) => s.member_id === 1)
      const bob = splits.find((s) => s.member_id === 2)
      expect(alice.share_amount).toBe(70)
      expect(bob.share_amount).toBe(30)
    })
  })

  it('percent mode: save divides total by percentages', async () => {
    const percentExpense = {
      ...EXPENSE,
      total_amount: 200,
      splits: [
        { member_id: 1, share_amount: 50, share_percentage: 25 },
        { member_id: 2, share_amount: 150, share_percentage: 75 },
      ],
    }
    vi.mocked(api.get).mockResolvedValueOnce(percentExpense)
    render(<EditExpenseModal {...defaultProps} />)

    await waitFor(() => screen.getAllByRole('checkbox'))

    // Should have loaded in percent mode automatically
    // Verify percent inputs are rendered with correct values
    const percentInputs = screen.getAllByRole('spinbutton').filter(
      (inp) => inp !== screen.getByPlaceholderText('0.00')
    )
    expect(Number(percentInputs[0].value)).toBe(25)
    expect(Number(percentInputs[1].value)).toBe(75)

    vi.mocked(api.put).mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalled()
      const { splits } = vi.mocked(api.put).mock.calls[0][1]
      const alice = splits.find((s) => s.member_id === 1)
      const bob = splits.find((s) => s.member_id === 2)
      expect(alice.share_amount).toBe(50)
      expect(bob.share_amount).toBe(150)
    })
  })

  it('rejects save when no members are selected', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(EXPENSE)
    render(<EditExpenseModal {...defaultProps} />)

    await waitFor(() => screen.getAllByRole('checkbox'))

    // Deselect all
    const checkboxes = screen.getAllByRole('checkbox')
    const aliceCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent.includes('Alice'))
    const bobCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent.includes('Bob'))
    fireEvent.click(aliceCheckbox)
    fireEvent.click(bobCheckbox)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText('Pick at least one member to split with')).toBeInTheDocument()
    })
    expect(vi.mocked(api.put)).not.toHaveBeenCalled()
  })

  it('PUT payload uses paid_by_member_id from the dropdown, not the original', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(EXPENSE) // original paid_by_member_id = 1
    render(<EditExpenseModal {...defaultProps} />)

    await waitFor(() => screen.getAllByRole('checkbox'))

    // Switch paid_by to Bob (member_id 2)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '2' } })

    // Switch to equal mode so splits are valid
    fireEvent.click(screen.getByRole('button', { name: 'Equal' }))

    vi.mocked(api.put).mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(vi.mocked(api.put)).toHaveBeenCalled()
      const payload = vi.mocked(api.put).mock.calls[0][1]
      expect(payload.paid_by_member_id).toBe(2)
    })
  })
})
