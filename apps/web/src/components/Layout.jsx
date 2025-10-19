import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import { Avatar } from './Avatar.jsx'

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-neutral-900/70 border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="font-semibold tracking-tight text-lg">ChillBill</Link>
          
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-4">
            <NavLink to="/" className={({isActive})=>isActive?"text-blue-600 dark:text-blue-400":"text-neutral-600 dark:text-neutral-400"}>Groups</NavLink>
            <button className="text-neutral-600 dark:text-neutral-400 text-sm" onClick={toggle}>
              {theme==='dark'?'☀️ Light':'🌙 Dark'}
            </button>
            <button className="text-neutral-600 dark:text-neutral-400 hover:text-red-600" onClick={()=>{ logout(); navigate('/login') }}>Logout</button>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">{user?.name}</div>
          </nav>

          {/* Mobile profile menu */}
          <div className="md:hidden relative" ref={menuRef}>
            <button 
              className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Avatar name={user?.name} size="sm" />
              <svg className="w-4 h-4 text-neutral-600 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg py-2">
                <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-700">
                  <div className="text-sm font-medium">{user?.name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{user?.email}</div>
                </div>
                <NavLink 
                  to="/" 
                  className="block px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => setMenuOpen(false)}
                >
                  📊 Groups
                </NavLink>
                <button 
                  className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() => { toggle(); setMenuOpen(false) }}
                >
                  {theme==='dark'?'☀️ Light mode':'🌙 Dark mode'}
                </button>
                <hr className="my-2 border-neutral-200 dark:border-neutral-700" />
                <button 
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  onClick={() => { logout(); navigate('/login'); setMenuOpen(false) }}
                >
                  🚪 Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Outlet />
        </div>
      </main>
    </div>
  )
}


