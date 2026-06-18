import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'

interface Props {
  children: React.ReactNode
  role?: UserRole
}

export default function ProtectedRoute({ children, role }: Props) {
  const { user, accessToken } = useAuthStore()

  if (!accessToken || !user) {
    return <Navigate to="/login" replace />
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard'} replace />
  }

  return <>{children}</>
}
