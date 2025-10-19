import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../utils/testUtils'
import LoginPage from '../../pages/LoginPage'
import * as api from '../../services/api'

// Mock the API
vi.mock('../../services/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ children, to }) => <a href={to}>{children}</a>,
  }
})

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders login form', () => {
    renderWithProviders(<LoginPage />)
    
    expect(screen.getByText('ChillBill')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('validates email format', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />)
    
    const emailInput = screen.getByPlaceholderText(/email/i)
    const passwordInput = screen.getByPlaceholderText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })
    
    await user.type(emailInput, 'invalid-email')
    await user.type(passwordInput, 'password123')
    await user.click(submitButton)
    
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
    expect(api.api.post).not.toHaveBeenCalled()
  })

  it('requires all fields', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginPage />)
    
    const submitButton = screen.getByRole('button', { name: /sign in/i })
    await user.click(submitButton)
    
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument()
  })

  it('handles successful login', async () => {
    const user = userEvent.setup()
    const mockLogin = vi.fn()
    
    api.api.post.mockResolvedValueOnce({
      access_token: 'mock-token',
      refresh_token: 'mock-refresh',
    })
    
    renderWithProviders(<LoginPage />, {
      authValue: {
        user: null,
        accessToken: null,
        login: mockLogin,
      },
    })
    
    const emailInput = screen.getByPlaceholderText(/email/i)
    const passwordInput = screen.getByPlaceholderText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })
    
    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')
    await user.click(submitButton)
    
    await waitFor(() => {
      expect(api.api.post).toHaveBeenCalledWith(
        '/auth/login',
        { email: 'test@example.com', password: 'password123' },
        {}
      )
    })
  })

  it('displays error on failed login', async () => {
    const user = userEvent.setup()
    
    api.api.post.mockRejectedValueOnce(new Error('Invalid credentials'))
    
    renderWithProviders(<LoginPage />)
    
    const emailInput = screen.getByPlaceholderText(/email/i)
    const passwordInput = screen.getByPlaceholderText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })
    
    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'wrongpassword')
    await user.click(submitButton)
    
    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument()
  })

  it('has link to signup page', () => {
    renderWithProviders(<LoginPage />)
    
    const signupLink = screen.getByText(/sign up/i)
    expect(signupLink).toBeInTheDocument()
    expect(signupLink.closest('a')).toHaveAttribute('href', '/signup')
  })
})

