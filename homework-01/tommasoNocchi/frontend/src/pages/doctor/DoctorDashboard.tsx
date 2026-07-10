import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Clock, Users, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { appointmentsApi, slotsApi } from '@/api/appointments'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/useDateLocale'
import type { Appointment, Slot } from '@/types'
import { format, isToday } from 'date-fns'

export default function DoctorDashboard() {
  const { user } = useAuthStore()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  useEffect(() => {
    Promise.all([
      appointmentsApi.getMyAppointments({ status: 'scheduled' }),
      slotsApi.getMySlots(),
    ]).then(([appts, sl]) => {
      setAppointments(appts)
      setSlots(sl)
    }).finally(() => setLoading(false))
  }, [])

  const todayAppts = appointments.filter(a =>
    a.slot && isToday(new Date(a.slot.start_datetime))
  )

  const availableSlots = slots.filter(s => s.is_available)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('doctor.greeting', { name: user?.first_name })}
        </h1>
        <p className="text-gray-500">{user?.doctor_profile?.specialty_name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{todayAppts.length}</p>
              <p className="text-sm text-gray-500">{t('doctor.todayAppointments')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <Clock className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{availableSlots.length}</p>
              <p className="text-sm text-gray-500">{t('doctor.availableSlots')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{appointments.length}</p>
              <p className="text-sm text-gray-500">{t('doctor.scheduledAppointments')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('doctor.todayTitle')}</CardTitle>
          <Link to="/doctor/appointments">
            <Button variant="ghost" size="sm">
              {t('doctor.seeAll')} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-400">{t('common.loading')}</p>
          ) : todayAppts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">{t('doctor.noTodayAppointments')}</p>
              <Link to="/doctor/slots">
                <Button variant="outline" className="mt-4" size="sm">{t('doctor.addAvailability')}</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {todayAppts.sort((a, b) =>
                new Date(a.slot!.start_datetime).getTime() - new Date(b.slot!.start_datetime).getTime()
              ).map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">
                      {a.patient?.first_name} {a.patient?.last_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {a.slot && format(new Date(a.slot.start_datetime), 'HH:mm')} —{' '}
                      {a.slot && format(new Date(a.slot.end_datetime), 'HH:mm')}
                    </p>
                    {a.reason && <p className="text-xs text-gray-400">{a.reason}</p>}
                  </div>
                  <Badge variant={a.appointment_type === 'procedure' ? 'secondary' : 'default'}>
                    {a.appointment_type === 'procedure' ? t('common.procedure') : t('common.visit')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
