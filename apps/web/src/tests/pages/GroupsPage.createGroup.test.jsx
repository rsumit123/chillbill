import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { api } from '../../services/api.js'

// ---- Mock all the heavy dependencies that GroupsPage pulls in ----

vi.mock('../../services/api.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    del: vi.fn(),
  },
}))

const mockPush = vi.fn()
vi.mock('../../components/Toast.jsx', () => ({
  useToast: () => ({ push: mockPush }),
  ToastProvider: ({ children }) => <>{children}</>,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ children, to }) => <a href={to}>{children}</a>,
  }
})

vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ accessToken: 'tok', user: { id: 'u1' } }),
  AuthContext: { Provider: ({ children }) => <>{children}</> },
}))

vi.mock('../../components/Avatar.jsx', () => ({
  Avatar: ({ name }) => <span>{name}</span>,
  GroupBadge: ({ children }) => <span>{children}</span>,
}))

vi.mock('../../components/Icons.jsx', () => ({
  Icon: () => <span />,
}))

vi.mock('../../components/Spinner.jsx', () => ({
  Spinner: () => <span data-testid="spinner" />,
  ButtonSpinner: () => <span />,
}))

vi.mock('../../components/ConfirmDialog.jsx', () => ({
  default: () => null,
}))

vi.mock('../../components/KebabMenu.jsx', () => ({
  default: () => null,
}))

vi.mock('../../components/PaymentNudgeBanner.jsx', () => ({
  default: () => null,
}))

vi.mock('../../services/fx.js', () => ({
  convert: vi.fn().mockResolvedValue(0),
  getRatesInfo: vi.fn().mockReturnValue(null),
}))

// NewGroupModal: renders a simple form that calls onCreate with { name, currency, emails, icon }
vi.mock('../../components/NewGroupModal.jsx', () => ({
  default: ({ open, onCreate }) => {
    if (!open) return null
    return (
      <div data-testid="new-group-modal">
        <button
          data-testid="submit-2-emails"
          onClick={() => onCreate({ name: 'Test', currency: 'INR', emails: ['a@x.com', 'b@x.com'], icon: 'group' })}
        >
          Create 2 members
        </button>
        <button
          data-testid="submit-no-emails"
          onClick={() => onCreate({ name: 'Test', currency: 'INR', emails: [], icon: 'group' })}
        >
          Create no members
        </button>
      </div>
    )
  },
}))

// ---- Helpers ----

async function mountAndOpenModal() {
  // Lazy import to pick up all mocks
  const { default: GroupsPage } = await import('../../pages/GroupsPage.jsx')
  const { BrowserRouter } = await import('react-router-dom')
  render(
    <BrowserRouter>
      <GroupsPage />
    </BrowserRouter>
  )
  // Wait for the initial load to finish (api.get is mocked to resolve immediately)
  await waitFor(() => expect(screen.queryByTestId('spinner')).not.toBeInTheDocument(), { timeout: 3000 })

  // Open the modal
  fireEvent.click(screen.getByRole('button', { name: /new group/i }))
  await waitFor(() => screen.getByTestId('new-group-modal'))
}

// Seed api.get to return empty lists so the page can mount without errors.
function seedApiGet() {
  vi.mocked(api.get).mockResolvedValue([])
}

// ---- Tests ----

describe('GroupsPage createGroupViaModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedApiGet()
  })

  it('all members added successfully — success toast with member count', async () => {
    const group = { id: 'g1', name: 'Test', currency: 'INR', icon: 'group' }
    vi.mocked(api.post)
      .mockResolvedValueOnce(group)     // create group
      .mockResolvedValueOnce({})         // add a@x.com
      .mockResolvedValueOnce({})         // add b@x.com

    await mountAndOpenModal()
    fireEvent.click(screen.getByTestId('submit-2-emails'))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled()
      const [msg, variant] = mockPush.mock.calls[0]
      expect(variant).toBe('success')
      expect(msg).toMatch(/2 member/)
    })
  })

  it('partial failure — error toast containing the failed email', async () => {
    const group = { id: 'g1', name: 'Test', currency: 'INR', icon: 'group' }
    vi.mocked(api.post)
      .mockResolvedValueOnce(group)                            // create group
      .mockResolvedValueOnce({})                               // a@x.com succeeds
      .mockRejectedValueOnce(new Error('not found'))           // b@x.com fails

    await mountAndOpenModal()
    fireEvent.click(screen.getByTestId('submit-2-emails'))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled()
      const [msg, variant] = mockPush.mock.calls[0]
      expect(variant).toBe('error')
      expect(msg).toContain('b@x.com')
    })
  })

  it('all fail — error toast with "Group created, but no members added"', async () => {
    const group = { id: 'g1', name: 'Test', currency: 'INR', icon: 'group' }
    vi.mocked(api.post)
      .mockResolvedValueOnce(group)                            // create group
      .mockRejectedValueOnce(new Error('not found'))           // a@x.com fails
      .mockRejectedValueOnce(new Error('not found'))           // b@x.com fails

    await mountAndOpenModal()
    fireEvent.click(screen.getByTestId('submit-2-emails'))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled()
      const [msg, variant] = mockPush.mock.calls[0]
      expect(variant).toBe('error')
      expect(msg).toContain('Group created, but no members added')
    })
  })

  it('no members supplied — success toast about adding members later', async () => {
    const group = { id: 'g1', name: 'Test', currency: 'INR', icon: 'group' }
    vi.mocked(api.post).mockResolvedValueOnce(group)

    await mountAndOpenModal()
    fireEvent.click(screen.getByTestId('submit-no-emails'))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled()
      const [msg, variant] = mockPush.mock.calls[0]
      expect(variant).toBe('success')
      expect(msg.toLowerCase()).toMatch(/add members later/)
    })
  })
})
