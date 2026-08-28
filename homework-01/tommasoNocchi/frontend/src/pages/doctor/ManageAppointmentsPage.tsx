import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, FolderOpen, FileEdit, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { appointmentsApi } from '@/api/appointments'
import { medicalRecordsApi } from '@/api/medicalRecords'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/useDateLocale'
import type { Appointment, AppointmentStatus } from '@/types'
import { format } from 'date-fns'

export default function ManageAppointmentsPage() {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [noteTarget, setNoteTarget] = useState<Appointment | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  const load = () => {
    setLoading(true)
    appointmentsApi.getMyAppointments()
      .then(setAppointments)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const statusConfig: Record<AppointmentStatus, {
    label: string
    variant: 'default' | 'success' | 'destructive' | 'warning' | 'secondary' | 'outline'
  }> = {
    scheduled: { label: t('common.status.scheduled'), variant: 'default' },
    completed: { label: t('common.status.completed'), variant: 'success' },
    cancelled: { label: t('common.status.cancelled'), variant: 'destructive' },
    no_show: { label: t('common.status.no_show'), variant: 'warning' },
  }

  const handleComplete = async (a: Appointment) => {
    await appointmentsApi.complete(a.id)
    load()
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    await appointmentsApi.cancel(cancelTarget.id, cancelReason)
    setCancelTarget(null)
    setCancelReason('')
    load()
  }

  const handleSaveNote = async () => {
    if (!noteTarget) return
    setNoteSaving(true)
    try {
      await medicalRecordsApi.createEntry(noteTarget.id, { title: noteTitle, content: noteContent })
      setNoteTarget(null)
      setNoteTitle('')
      setNoteContent('')
    } finally {
      setNoteSaving(false)
    }
  }

  const byStatus = (status: AppointmentStatus) => appointments.filter(a => a.status === status)

  const AppointmentCard = ({ a }: { a: Appointment }) => {
    const cfg = statusConfig[a.status]
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">
                  {a.patient?.first_name} {a.patient?.last_name}
                </p>
                <Badge variant={a.appointment_type === 'procedure' ? 'secondary' : 'outline'} className="text-xs">
                  {a.appointment_type === 'procedure' ? t('common.procedure') : t('common.visit')}
                </Badge>
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
              </div>
              <p className="text-sm text-gray-500">
                {a.slot ? format(new Date(a.slot.start_datetime), "dd MMM yyyy 'alle' HH:mm", { locale: dateLocale }) : '—'}
              </p>
              {a.reason && <p className="text-xs text-gray-400">{a.reason}</p>}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {a.status === 'scheduled' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => handleComplete(a)}>
                    <CheckCircle className="h-4 w-4 mr-1" /> {t('doctor.completeBtn')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setCancelTarget(a)}>
                    <XCircle className="h-4 w-4 mr-1" /> {t('doctor.cancelBtn')}
                  </Button>
                </>
              )}
              {a.status === 'completed' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => { setNoteTarget(a); setNoteTitle(''); setNoteContent('') }}>
                    <FileEdit className="h-4 w-4 mr-1" /> {t('doctor.noteBtn')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/doctor/patients/${a.patient_id}/record`)}>
                    <FolderOpen className="h-4 w-4 mr-1" /> {t('doctor.recordBtn')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('doctor.manageAppointments')}</h1>

      {loading ? <p className="text-gray-400">{t('common.loading')}</p> : (
        <Tabs defaultValue="scheduled">
          <TabsList>
            <TabsTrigger value="scheduled">
              <Clock className="h-4 w-4 mr-1" /> {t('doctor.scheduledTab')} ({byStatus('scheduled').length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              <CheckCircle className="h-4 w-4 mr-1" /> {t('doctor.completedTab')} ({byStatus('completed').length})
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              <XCircle className="h-4 w-4 mr-1" /> {t('doctor.cancelledTab')} ({byStatus('cancelled').length})
            </TabsTrigger>
          </TabsList>
          {(['scheduled', 'completed', 'cancelled'] as AppointmentStatus[]).map(s => (
            <TabsContent key={s} value={s}>
              {byStatus(s).length === 0 ? (
                <p className="text-gray-400 text-center py-8">{t('doctor.noAppointments')}</p>
              ) : (
                <div className="space-y-3">
                  {byStatus(s).map(a => <AppointmentCard key={a.id} a={a} />)}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Dialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('doctor.cancelAppointment')}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            {t('doctor.cancelConfirm', { name: `${cancelTarget?.patient?.first_name} ${cancelTarget?.patient?.last_name}` })}
          </p>
          <Textarea
            placeholder={t('doctor.cancellationReason')}
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>{t('doctor.back')}</Button>
            <Button variant="destructive" onClick={handleCancel}>{t('doctor.confirmCancellation')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!noteTarget} onOpenChange={() => setNoteTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t('doctor.addClinicalNote')}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            {t('doctor.patientLabel', { name: `${noteTarget?.patient?.first_name} ${noteTarget?.patient?.last_name}` })}
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('doctor.noteTitle')}</Label>
              <Input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder={t('doctor.noteTitlePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('doctor.clinicalContent')}</Label>
              <Textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder={t('doctor.clinicalContentPlaceholder')}
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteTarget(null)}>{t('doctor.cancel')}</Button>
            <Button onClick={handleSaveNote} disabled={noteSaving || !noteTitle || !noteContent}>
              {noteSaving ? t('doctor.savingNote') : t('doctor.saveNote')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
