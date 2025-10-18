import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import GroupsPage from './pages/GroupsPage.jsx'
import GroupDetailPage from './pages/GroupDetailPage.jsx'
import Layout from './components/Layout.jsx'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { ToastProvider } from './components/Toast.jsx'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<GroupsPage />} />
            <Route path="groups/:groupId" element={<GroupDetailPage />} />
          </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}


