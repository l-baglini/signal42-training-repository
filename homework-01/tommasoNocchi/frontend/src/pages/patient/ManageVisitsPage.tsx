import { useState, useEffect } from 'react'
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { appointmentsApi } from '@/api/appointments'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/useDateLocale'
import type { Appointment, AppointmentStatus } from '@/types'
import { format } from 'date-fns'

type Props = { appointmentType: 'visit' | 'procedure' }

function AppointmentCard({ a, onCancel }: { a: Appointment; onCancel: (a: Appointment) => void }) {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  const statusConfig: Record<AppointmentStatus, {
    label: string
    variant: 'default' | 'success' | 'destructive' | 'warning' | 'secondary' | 'outline'
    icon: React.FC<{ className?: string }>
  }> = {
    scheduled: { label: t('common.status.scheduled'), variant: 'default', icon: Clock },
    completed: { label: t('common.status.completed'), variant: 'success', icon: CheckCircle },
    cancelled: { label: t('common.status.cancelled'), variant: 'destructive', icon: XCircle },
    no_show: { label: t('common.status.no_show'), variant: 'warning', icon: AlertCircle },
  }

  const cfg = statusConfig[a.status]
  const Icon = cfg.icon

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">Dr. {a.doctor?.first_name} {a.doctor?.last_name}</p>
            <span className="text-xs text-gray-400">{a.doctor?.specialty_name}</span>
          </div>
          <p className="text-sm text-gray-500">
            {a.slot ? format(new Date(a.slot.start_datetime), "dd MMM yyyy 'alle' HH:mm", { locale: dateLocale }) : '—'}
          </p>
          {a.reason && <p className="text-xs text-gray-400">{t('patient.reason')}: {a.reason}</p>}
          {a.cancellation_reason && <p className="text-xs text-red-400">{t('patient.cancellationReason')}: {a.cancellation_reason}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={cfg.variant}>
            <Icon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
          {a.status === 'scheduled' && (
            <Button variant="outline" size="sm" onClick={() => onCancel(a)}>{t('patient.annul')}</Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ManageAppointmentsView({ appointmentType }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const { t } = useTranslation()

  const load = () => {
    setLoading(true)
    appointmentsApi.getMyAppointments({ type: appointmentType })
      .then(setAppointments)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [appointmentType])

  const handleCancel = async () => {
    if (!cancelTarget) return
    await appointmentsApi.cancel(cancelTarget.id, cancelReason)
    setCancelTarget(null)
    setCancelReason('')
    load()
  }

  const byStatus = (status: AppointmentStatus) => appointments.filter(a => a.status === status && a.appointment_type === appointmentType)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{appointmentType === 'visit' ? t('patient.myVisits') : t('patient.myProcedures')}</h1>

      {loading ? <p className="text-gray-400">{t('common.loading')}</p> : (
        <Tabs defaultValue="scheduled">
          <TabsList>
            <TabsTrigger value="scheduled">{t('patient.scheduled')} ({byStatus('scheduled').length})</TabsTrigger>
            <TabsTrigger value="completed">{t('patient.past')} ({byStatus('completed').length})</TabsTrigger>
            <TabsTrigger value="cancelled">{t('patient.cancelled')} ({byStatus('cancelled').length})</TabsTrigger>
          </TabsList>
          {(['scheduled', 'completed', 'cancelled'] as AppointmentStatus[]).map(status => (
            <TabsContent key={status} value={status}>
              {byStatus(status).length === 0 ? (
                <p className="text-gray-400 text-center py-8">{t('patient.noAppointmentsList')}</p>
              ) : (
                <div className="space-y-3">
                  {byStatus(status).map(a => (
                    <AppointmentCard key={a.id} a={a} onCancel={setCancelTarget} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Dialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('patient.cancelAppointment')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            {t('patient.cancelConfirm', { name: `${cancelTarget?.doctor?.first_name} ${cancelTarget?.doctor?.last_name}` })}
          </p>
          <Textarea
            placeholder={t('patient.cancellationReasonOptional')}
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>{t('patient.cancel')}</Button>
            <Button variant="destructive" onClick={handleCancel}>{t('patient.confirmCancellation')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ManageVisitsPage() {
  return <ManageAppointmentsView appointmentType="visit" />
}
