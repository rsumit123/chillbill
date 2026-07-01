import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReceiptSplitModal from '../../components/ReceiptSplitModal.jsx'

vi.mock('../../components/Toast.jsx', () => ({ useToast: () => ({ push: vi.fn() }) }))
vi.mock('../../components/Modal.jsx', () => ({
  default: ({ children, open }) => open ? <div>{children}</div> : null,
}))

const GROUP = {
  id: 'g1',
  currency: 'INR',
  members: [
    { member_id: 1, name: 'Alice', is_ghost: false },
    { member_id: 2, name: 'Bob',   is_ghost: false },
    { member_id: 3, name: 'Carol', is_ghost: false },
  ],
}

const PARSED = {
  merchant: 'Sagar Ratna',
  currency: 'INR',
  subtotal: 1000, tax: 100, tip: 0, service_charge: 80, discount: 0,
  total: 1180,
  confidence: 'high',
  items: [
    { name: 'Chicken curry', quantity: 1, line_total: 300 },
    { name: 'Beer',          quantity: 2, line_total: 200 },
    { name: 'Butter naan',   quantity: 3, line_total: 500 },
  ],
}

function openModal(overrides = {}) {
  const onSubmit = vi.fn().mockResolvedValue({})
  const utils = render(
    <ReceiptSplitModal
      open={true}
      parsed={PARSED}
      group={GROUP}
      onSubmit={onSubmit}
      onClose={() => {}}
      onCreated={() => {}}
      {...overrides}
    />
  )
  return { onSubmit, ...utils }
}

describe('ReceiptSplitModal', () => {
  it('renders parsed items and merchant', () => {
    openModal()
    expect(screen.getByText('Sagar Ratna')).toBeInTheDocument()
    expect(screen.getByText(/Chicken curry/)).toBeInTheDocument()
    expect(screen.getByText(/Beer/)).toBeInTheDocument()
  })

  it('starts with Save disabled until items are assigned and payer picked', () => {
    openModal()
    const save = screen.getByRole('button', { name: /Create expense/ })
    expect(save).toBeDisabled()
  })

  it('assigning items to one member gives them all the food + all extras', async () => {
    openModal()
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getAllByText(/Assign/)[0])
      fireEvent.click(screen.getByLabelText('Alice'))
      fireEvent.click(screen.getByText('Done'))
    }
    await waitFor(() => {
      expect(screen.getAllByText(/1,180/).length).toBeGreaterThan(0)
    })
  })

  it('assigning an item to two members splits its cost equally', async () => {
    openModal()
    fireEvent.click(screen.getAllByText(/Assign/)[0])
    fireEvent.click(screen.getByLabelText('Alice'))
    fireEvent.click(screen.getByLabelText('Bob'))
    fireEvent.click(screen.getByText('Done'))
    // Chicken curry ₹300 split between Alice+Bob.
    // Each gets 150 food. Extras (180) are split proportionally: (150/1000)*180 = 27 each.
    // Bob's share: 177. diff adjustment adds remainder to Alice.
    await waitFor(() => {
      expect(screen.getAllByText(/177/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('per-person totals sum to the parsed total once all items are assigned', async () => {
    openModal()
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getAllByText(/Assign/)[0])
      fireEvent.click(screen.getByLabelText('Alice'))
      fireEvent.click(screen.getByText('Done'))
    }
    await waitFor(() => {
      expect(screen.getAllByText(/₹1,180/).length).toBeGreaterThan(0)
    })
  })

  it('deleting an item removes it from the list', () => {
    openModal()
    const deleteBtns = screen.getAllByLabelText('delete item')
    fireEvent.click(deleteBtns[0])
    expect(screen.queryByText(/Chicken curry/)).toBeNull()
  })

  it('Save button disabled while any item is unassigned', () => {
    openModal()
    fireEvent.click(screen.getAllByText(/Assign/)[0])
    fireEvent.click(screen.getByLabelText('Alice'))
    fireEvent.click(screen.getByText('Done'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })
    expect(screen.getByRole('button', { name: /Create expense/ })).toBeDisabled()
    expect(screen.getByText(/2 items haven't been assigned/)).toBeInTheDocument()
  })

  it('Save calls onSubmit with correctly-shaped payload', async () => {
    const { onSubmit } = openModal()
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getAllByText(/Assign/)[0])
      fireEvent.click(screen.getByLabelText('Alice'))
      fireEvent.click(screen.getByText('Done'))
    }
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /Create expense/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.amount).toBe(1180)
    expect(payload.paidByMemberId).toBe(1)
    expect(payload.mode).toBe('amount')
    expect(payload.splits).toHaveLength(1)
    expect(payload.splits[0].member_id).toBe(1)
    expect(payload.splits[0].share_amount).toBeCloseTo(1180, 1)
    expect(payload.note).toMatch(/scanned/i)
  })
})
