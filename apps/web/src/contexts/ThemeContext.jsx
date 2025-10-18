import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('cb_theme') || 'light')

  useEffect(() => {
    localStorage.setItem('cb_theme', theme)
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark'); else root.classList.remove('dark')
  }, [theme])

  const value = useMemo(() => ({ theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() { return useContext(ThemeContext) }


