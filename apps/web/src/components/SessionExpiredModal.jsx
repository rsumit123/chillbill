import React from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from './Modal'
import { useAuth } from '../contexts/AuthContext'

export default function SessionExpiredModal() {
  const { sessionExpired, clearSessionExpired, logout } = useAuth()
  const navigate = useNavigate()

  function handleLoginAgain() {
    logout() // Clear all auth data
    clearSessionExpired()
    navigate('/login')
  }

  return (
    <Modal open={sessionExpired} onClose={() => {}}>
      <div className="p-6 text-center">
        {/* Icon */}
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 dark:bg-yellow-900/30 mb-4">
          <svg
            className="h-8 w-8 text-yellow-600 dark:text-yellow-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          Session Expired
        </h3>

        {/* Message */}
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
          Your session has expired due to inactivity. Please log in again to continue.
        </p>

        {/* Action */}
        <button
          onClick={handleLoginAgain}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
        >
          Log In Again
        </button>
      </div>
    </Modal>
  )
}

