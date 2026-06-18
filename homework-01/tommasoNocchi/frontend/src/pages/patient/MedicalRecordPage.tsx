import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, FolderOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { medicalRecordsApi } from '@/api/medicalRecords'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/useDateLocale'
import type { PatientMedicalRecord, SpecialtyGroup, MedicalRecordEntry } from '@/types'
import { format } from 'date-fns'

function EntryCard({ entry }: { entry: MedicalRecordEntry }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  return (
    <div className="border-l-2 border-blue-200 pl-4 py-2">
      <div className="flex items-start justify-between">
        <div>
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
        <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 text-sm text-gray-700 bg-gray-50 p-3 rounded whitespace-pre-wrap">
          {entry.content}
        </div>
      )}
    </div>
  )
}

function SpecialtySection({ group, isSelected }: { group: SpecialtyGroup; isSelected: boolean }) {
  const { t } = useTranslation()
  if (!isSelected) return null
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">{group.specialty_name}</h3>
      {group.entries.length === 0 ? (
        <p className="text-gray-400">{t('patient.noClinicNotes')}</p>
      ) : (
        <div className="space-y-4">
          {[...group.entries].reverse().map(e => <EntryCard key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  )
}

export default function MedicalRecordPage() {
  const { user } = useAuthStore()
  const [record, setRecord] = useState<PatientMedicalRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSpecialty, setSelectedSpecialty] = useState<number | null>(null)
  const { t } = useTranslation()

  const patientId = user?.patient_profile?.id

  useEffect(() => {
    if (!patientId) return
    medicalRecordsApi.getPatientRecord(patientId)
      .then(r => {
        setRecord(r)
        if (r.specialties.length > 0) setSelectedSpecialty(r.specialties[0].specialty_id)
      })
      .finally(() => setLoading(false))
  }, [patientId])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('patient.medicalRecordTitle')}</h1>
        <p className="text-gray-500">{t('patient.medicalRecordSubtitle')}</p>
      </div>

      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : !record || record.specialties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-400">{t('patient.medicalRecordEmpty')}</p>
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
                {record.specialties.map(g => (
                  <SpecialtySection key={g.specialty_id} group={g} isSelected={selectedSpecialty === g.specialty_id} />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
