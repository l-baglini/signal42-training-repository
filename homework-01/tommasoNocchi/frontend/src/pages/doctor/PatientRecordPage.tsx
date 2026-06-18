import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Edit, FolderOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { medicalRecordsApi } from '@/api/medicalRecords'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/useDateLocale'
import type { PatientMedicalRecord, MedicalRecordEntry } from '@/types'
import { format } from 'date-fns'

function EntryCard({
  entry,
  canEdit,
  onEdit,
}: {
  entry: MedicalRecordEntry
  canEdit: boolean
  onEdit: (entry: MedicalRecordEntry) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  return (
    <div className="border-l-2 border-blue-200 pl-4 py-2">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {format(new Date(entry.entry_date), 'dd MMM yyyy', { locale: dateLocale })}
            </span>
            <Badge variant={entry.appointment_type === 'procedure' ? 'secondary' : 'outline'} className="text-xs">
              {entry.appointment_type === 'procedure' ? t('common.procedure') : t('common.visit')}
            </Badge>
          </div>
          <p className="font-medium mt-1">{entry.title}</p>
          <p className="text-xs text-gray-500">
            Dr. {entry.doctor?.first_name} {entry.doctor?.last_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(entry)}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 text-sm text-gray-700 bg-gray-50 p-3 rounded whitespace-pre-wrap">
          {entry.content}
        </div>
      )}
    </div>
  )
}

export default function PatientRecordPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const doctorId = user?.doctor_profile?.id
  const { t } = useTranslation()

  const [record, setRecord] = useState<PatientMedicalRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedSpecialty, setSelectedSpecialty] = useState<number | null>(null)
  const [editTarget, setEditTarget] = useState<MedicalRecordEntry | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (!patientId) return
    medicalRecordsApi.getPatientRecord(Number(patientId))
      .then(r => {
        setRecord(r)
        if (r.specialties.length > 0) setSelectedSpecialty(r.specialties[0].specialty_id)
      })
      .catch(() => setError(t('doctor.accessDenied')))
      .finally(() => setLoading(false))
  }, [patientId])

  const handleEdit = (entry: MedicalRecordEntry) => {
    setEditTarget(entry)
    setEditTitle(entry.title)
    setEditContent(entry.content)
  }

  const handleSaveEdit = async () => {
    if (!editTarget) return
    setEditSaving(true)
    try {
      await medicalRecordsApi.updateEntry(editTarget.id, { title: editTitle, content: editContent })
      setEditTarget(null)
      if (patientId) {
        medicalRecordsApi.getPatientRecord(Number(patientId)).then(setRecord)
      }
    } finally {
      setEditSaving(false)
    }
  }

  if (loading) return <p className="text-gray-400">{t('common.loading')}</p>
  if (error) return (
    <div className="text-center py-16">
      <p className="text-red-500">{error}</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>{t('doctor.goBack')}</Button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {t('doctor.patientRecord', { name: `${record?.first_name} ${record?.last_name}` })}
          </h1>
          <p className="text-gray-500 text-sm">{t('doctor.editOnly')}</p>
        </div>
      </div>

      {!record || record.specialties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-400">{t('doctor.noRecordEntries')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-6">
          <aside className="w-56 shrink-0">
            <Card>
              <CardHeader><CardTitle className="text-sm">{t('doctor.specialties')}</CardTitle></CardHeader>
              <CardContent className="p-2">
                {record.specialties.map(g => (
                  <button
                    key={g.specialty_id}
                    onClick={() => setSelectedSpecialty(g.specialty_id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selectedSpecialty === g.specialty_id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-600'}`}
                  >
                    {g.specialty_name}
                    <span className="ml-2 text-xs text-gray-400">({g.entries.length})</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </aside>
          <div className="flex-1">
            <Card>
              <CardContent className="p-6">
                {record.specialties.filter(g => g.specialty_id === selectedSpecialty).map(g => (
                  <div key={g.specialty_id} className="space-y-4">
                    <h3 className="font-semibold text-lg">{g.specialty_name}</h3>
                    {[...g.entries].reverse().map(e => (
                      <EntryCard
                        key={e.id}
                        entry={e}
                        canEdit={e.doctor?.id === doctorId}
                        onEdit={handleEdit}
                      />
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t('doctor.editNote')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('doctor.noteTitle')}</Label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('doctor.content')}</Label>
              <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={8} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>{t('doctor.cancel')}</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving || !editTitle || !editContent}>
              {editSaving ? t('doctor.saving') : t('doctor.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
