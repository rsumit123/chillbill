import { Link } from 'react-router-dom'
import GoogleSignInButton from '../components/GoogleSignInButton.jsx'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-neutral-900 dark:to-neutral-950 flex flex-col">
      {/* Back to home */}
      <div className="p-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Home
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 pb-8">
        <div className="w-full max-w-sm mx-auto">
          {/* Branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-4 shadow-lg shadow-blue-500/25">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-1 text-neutral-900 dark:text-neutral-100">ChillBill</h1>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm">Split expenses. Track balances. Stay chill.</p>
          </div>

          {/* Auth card */}
          <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/80 dark:bg-neutral-900/80 backdrop-blur p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-center mb-2 text-neutral-900 dark:text-neutral-100">Sign in to continue</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-6">New here? Your account is created automatically.</p>
            <GoogleSignInButton />
          </div>
        </div>
      </div>
    </div>
  )
}
