import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Home, Calendar, ClipboardList, Scissors, FolderOpen, LogOut, Stethoscope } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/auth'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'

export default function PatientLayout() {
  const { user, logout, refreshToken } = useAuthStore()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const nav = [
    { to: '/patient/dashboard', icon: Home, label: t('nav.dashboard') },
    { to: '/patient/book-visit', icon: Calendar, label: t('nav.bookVisit') },
    { to: '/patient/visits', icon: ClipboardList, label: t('nav.myVisits') },
    { to: '/patient/book-procedure', icon: Scissors, label: t('nav.bookProcedure') },
    { to: '/patient/procedures', icon: ClipboardList, label: t('nav.myProcedures') },
    { to: '/patient/medical-record', icon: FolderOpen, label: t('nav.medicalRecord') },
  ]

  const handleLogout = async () => {
    if (refreshToken) await authApi.logout(refreshToken).catch(() => {})
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold text-blue-700">MediClinic</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{user?.first_name} {user?.last_name}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn('flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100')
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t space-y-2">
          <div className="flex justify-start">
            <LanguageSwitcher />
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-sm text-gray-600 hover:bg-gray-100 rounded-md"
          >
            <LogOut className="h-4 w-4" />
            {t('nav.logout')}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
