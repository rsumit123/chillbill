import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AuthContext } from '../../contexts/AuthContext'
import { ThemeContext } from '../../contexts/ThemeContext'
import { ToastProvider } from '../../components/Toast'

/**
 * Custom render function with all required providers
 */
export function renderWithProviders(
  ui,
  {
    authValue = {
      user: null,
      accessToken: null,
      refreshToken: null,
      login: async () => {},
      logout: () => {},
      signup: async () => {},
    },
    themeValue = {
      theme: 'light',
      toggleTheme: () => {},
    },
    ...renderOptions
  } = {}
) {
  function Wrapper({ children }) {
    return (
      <BrowserRouter>
        <ThemeContext.Provider value={themeValue}>
          <AuthContext.Provider value={authValue}>
            <ToastProvider>
              {children}
            </ToastProvider>
          </AuthContext.Provider>
        </ThemeContext.Provider>
      </BrowserRouter>
    )
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

/**
 * Mock user object for testing
 */
export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
}

/**
 * Mock authenticated auth context
 */
export const mockAuthContext = {
  user: mockUser,
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  login: async () => {},
  logout: () => {},
  signup: async () => {},
}

/**
 * Mock API responses
 */
export const mockApiResponses = {
  groups: [
    {
      id: 'group-1',
      name: 'Test Group',
      currency: 'USD',
      icon: 'group',
    },
    {
      id: 'group-2',
      name: 'Trip Group',
      currency: 'EUR',
      icon: 'trip',
    },
  ],
  groupDetail: {
    id: 'group-1',
    name: 'Test Group',
    currency: 'USD',
    icon: 'group',
    members: [
      {
        member_id: 1,
        user_id: 'test-user-id',
        name: 'Test User',
        email: 'test@example.com',
        is_ghost: false,
      },
      {
        member_id: 2,
        user_id: 'user-2',
        name: 'User Two',
        email: 'user2@example.com',
        is_ghost: false,
      },
    ],
  },
  expenses: [
    {
      id: 'expense-1',
      note: 'Dinner',
      total_amount: 50.00,
      currency: 'USD',
      date: '2025-10-19T00:00:00Z',
      created_by: 'test-user-id',
      participant_member_ids: [1, 2],
    },
  ],
  balances: {
    balances: {
      'test-user-id': 25.00,
      'user-2': -25.00,
    },
  },
}

