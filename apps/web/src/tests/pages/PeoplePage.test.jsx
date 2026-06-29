import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PeoplePage from '../../pages/PeoplePage.jsx'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ accessToken: 'TEST_TOKEN' }),
}))

const apiGet = vi.fn()
vi.mock('../../services/api.js', () => ({
  api: { get: (...args) => apiGet(...args) },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <PeoplePage />
    </MemoryRouter>
  )
}

describe('PeoplePage', () => {
  beforeEach(() => {
    apiGet.mockReset()
    mockNavigate.mockReset()
  })

  it('shows loading initially then empty state when API returns no people', async () => {
    apiGet.mockResolvedValueOnce({ people: [] })
    renderPage()
    await waitFor(() => expect(screen.getByText(/all settled up/i)).toBeInTheDocument())
  })

  it('renders one row per person', async () => {
    apiGet.mockResolvedValueOnce({
      people: [
        {
          user_id: 'u1', name: 'Aarav', avatar_url: null,
          balances: { INR: 800 },
          groups: [
            { group_id: 'g1', group_name: 'Goa Trip', currency: 'INR', balance: 600 },
            { group_id: 'g2', group_name: 'Flatmate', currency: 'INR', balance: 200 },
          ],
        },
        {
          user_id: 'u2', name: 'Priya', avatar_url: null,
          balances: { INR: -400 },
          groups: [{ group_id: 'g3', group_name: 'Dinner', currency: 'INR', balance: -400 }],
        },
      ],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Aarav')).toBeInTheDocument())
    expect(screen.getByText('Priya')).toBeInTheDocument()
  })

  it('expanding a row shows per-group breakdown', async () => {
    apiGet.mockResolvedValueOnce({
      people: [
        {
          user_id: 'u1', name: 'Aarav', avatar_url: null,
          balances: { INR: 600 },
          groups: [{ group_id: 'g1', group_name: 'Goa Trip', currency: 'INR', balance: 600 }],
        },
      ],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Aarav')).toBeInTheDocument())
    expect(screen.queryByText('Goa Trip')).toBeNull()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    await waitFor(() => expect(screen.getByText('Goa Trip')).toBeInTheDocument())
  })

  it('clicking a group row navigates to that group', async () => {
    apiGet.mockResolvedValueOnce({
      people: [
        {
          user_id: 'u1', name: 'Aarav', avatar_url: null,
          balances: { INR: 600 },
          groups: [{ group_id: 'g123', group_name: 'Goa Trip', currency: 'INR', balance: 600 }],
        },
      ],
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('Aarav')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    await waitFor(() => expect(screen.getByText('Goa Trip')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Goa Trip').closest('button'))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/groups/g123')
  })

  it('renders error banner with retry on API failure', async () => {
    apiGet.mockRejectedValueOnce(new Error('Network down'))
    renderPage()
    await waitFor(() => expect(screen.getByText(/network down/i)).toBeInTheDocument())
    apiGet.mockResolvedValueOnce({ people: [] })
    fireEvent.click(screen.getByText(/retry/i))
    await waitFor(() => expect(screen.getByText(/all settled up/i)).toBeInTheDocument())
  })
})
