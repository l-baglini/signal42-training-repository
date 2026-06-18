import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, FolderOpen, Clock, CheckCircle, XCircle, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { appointmentsApi } from '@/api/appointments'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/useDateLocale'
import type { Appointment } from '@/types'
import { format } from 'date-fns'

export default function PatientDashboard() {
  const { user } = useAuthStore()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  useEffect(() => {
    appointmentsApi.getMyAppointments({ status: 'scheduled' })
      .then(setAppointments)
      .finally(() => setLoading(false))
  }, [])

  const upcoming = appointments.slice(0, 3)

  const statusConfig = {
    scheduled: { label: t('common.status.scheduled'), variant: 'default' as const, icon: Clock },
    completed: { label: t('common.status.completed'), variant: 'success' as const, icon: CheckCircle },
    cancelled: { label: t('common.status.cancelled'), variant: 'destructive' as const, icon: XCircle },
    no_show: { label: t('common.status.no_show'), variant: 'warning' as const, icon: XCircle },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('patient.greeting', { name: user?.first_name })}
        </h1>
        <p className="text-gray-500">{t('patient.greetingDesc')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/patient/book-visit">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-blue-100">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold">{t('patient.bookVisit')}</p>
                <p className="text-sm text-gray-500">{t('patient.bookVisitDesc')}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/patient/book-procedure">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-green-100">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 bg-green-100 rounded-lg">
                <Calendar className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold">{t('patient.bookProcedure')}</p>
                <p className="text-sm text-gray-500">{t('patient.bookProcedureDesc')}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/patient/medical-record">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-purple-100">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="p-3 bg-purple-100 rounded-lg">
                <FolderOpen className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold">{t('patient.medicalRecord')}</p>
                <p className="text-sm text-gray-500">{t('patient.medicalRecordDesc')}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t('patient.upcomingAppointments')}</CardTitle>
          <Link to="/patient/visits">
            <Button variant="ghost" size="sm">
              {t('patient.seeAll')} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-400 text-sm">{t('common.loading')}</p>
          ) : upcoming.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">{t('patient.noAppointments')}</p>
              <Link to="/patient/book-visit">
                <Button className="mt-4" size="sm">{t('patient.bookNow')}</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map(a => {
                const cfg = statusConfig[a.status]
                return (
                  <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">
                        Dr. {a.doctor?.first_name} {a.doctor?.last_name}
                        <span className="ml-2 text-gray-400 text-xs">{a.doctor?.specialty_name}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {a.slot ? format(new Date(a.slot.start_datetime), 'dd MMM yyyy, HH:mm', { locale: dateLocale }) : '—'}
                      </p>
                    </div>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
