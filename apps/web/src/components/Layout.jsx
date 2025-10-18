import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'

export default function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 dark:bg-neutral-900/70 border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="font-semibold tracking-tight">ChillBill</Link>
          <nav className="flex items-center gap-4">
            <NavLink to="/" className={({isActive})=>isActive?"text-blue-600":"text-neutral-600"}>Groups</NavLink>
            <button className="text-neutral-600" onClick={toggle}>{theme==='dark'?'Light':'Dark'} mode</button>
            <button className="text-neutral-600 hover:text-red-600" onClick={()=>{ logout(); navigate('/login') }}>Logout</button>
            <div className="text-sm text-neutral-500">{user?.name}</div>
          </nav>
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


