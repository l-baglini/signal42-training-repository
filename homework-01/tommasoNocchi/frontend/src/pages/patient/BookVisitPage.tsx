import { useState, useEffect } from 'react'
import { CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { specialtiesApi, doctorsApi, appointmentsApi } from '@/api/appointments'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/useDateLocale'
import type { Specialty, Doctor, Slot } from '@/types'
import { format, addDays, startOfWeek } from 'date-fns'

type Step = 1 | 2 | 3 | 4 | 5

export default function BookVisitPage() {
  return <BookingFlow slotType="visit" />
}

export function BookingFlow({ slotType }: { slotType: 'visit' | 'procedure' }) {
  const [step, setStep] = useState<Step>(1)
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))

  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty | null>(null)
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [reason, setReason] = useState('')
  const [booked, setBooked] = useState(false)
  const [loading, setLoading] = useState(false)

  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  useEffect(() => { specialtiesApi.list().then(setSpecialties) }, [])

  useEffect(() => {
    if (selectedSpecialty) {
      doctorsApi.list(selectedSpecialty.id).then(setDoctors)
    }
  }, [selectedSpecialty])

  useEffect(() => {
    if (selectedDoctor) {
      const dateFrom = weekStart.toISOString()
      const dateTo = addDays(weekStart, 7).toISOString()
      doctorsApi.getSlots(selectedDoctor.id, { date_from: dateFrom, date_to: dateTo, type: slotType })
        .then(setSlots)
    }
  }, [selectedDoctor, weekStart, slotType])

  const handleBook = async () => {
    if (!selectedSlot) return
    setLoading(true)
    try {
      await appointmentsApi.book({ slot_id: selectedSlot.id, appointment_type: slotType, reason })
      setBooked(true)
    } finally {
      setLoading(false)
    }
  }

  const typeLabel = slotType === 'visit' ? t('common.visit') : t('common.procedure')

  if (booked) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <CheckCircle className="h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-bold">{t('patient.bookingConfirmed')}</h2>
        <p className="text-gray-500">
          {t('patient.bookingConfirmedDesc', {
            type: typeLabel,
            doctor: `${selectedDoctor?.first_name} ${selectedDoctor?.last_name}`,
          })}
          {selectedSlot && ` — ${format(new Date(selectedSlot.start_datetime), "dd MMM yyyy 'alle' HH:mm", { locale: dateLocale })}`}
        </p>
        <Button onClick={() => { setStep(1); setBooked(false); setSelectedSpecialty(null); setSelectedDoctor(null); setSelectedSlot(null); setReason('') }}>
          {t('patient.newBooking')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">{slotType === 'visit' ? t('patient.bookVisit') : t('patient.bookProcedure')}</h1>
        <div className="flex gap-2 mt-3">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-2 flex-1 rounded-full ${step >= s ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>{t('patient.selectSpecialty')}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {specialties.map(s => (
              <button
                key={s.id}
                onClick={() => { setSelectedSpecialty(s); setStep(2) }}
                className={`p-4 text-left border-2 rounded-lg hover:border-blue-500 transition-colors ${selectedSpecialty?.id === s.id ? 'border-blue-500 bg-blue-50' : ''}`}
              >
                <p className="font-semibold text-sm">{s.name}</p>
                <p className="text-xs text-gray-500">{s.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4" /></Button>
              <CardTitle>{t('patient.selectDoctor', { specialty: selectedSpecialty?.name })}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {doctors.length === 0 ? (
              <p className="text-gray-400">{t('patient.noDoctor')}</p>
            ) : doctors.map(d => (
              <button
                key={d.id}
                onClick={() => { setSelectedDoctor(d); setStep(3) }}
                className={`w-full p-4 text-left border-2 rounded-lg hover:border-blue-500 transition-colors ${selectedDoctor?.id === d.id ? 'border-blue-500 bg-blue-50' : ''}`}
              >
                <p className="font-semibold">Dr. {d.first_name} {d.last_name}</p>
                {d.bio && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{d.bio}</p>}
                {d.years_experience && <p className="text-xs text-blue-600 mt-1">{t('patient.yearsExperience', { n: d.years_experience })}</p>}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4" /></Button>
              <CardTitle>{t('patient.selectTime')}</CardTitle>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setWeekStart(d => addDays(d, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {format(weekStart, 'dd MMM', { locale: dateLocale })} — {format(addDays(weekStart, 6), 'dd MMM yyyy', { locale: dateLocale })}
              </span>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(d => addDays(d, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {slots.length === 0 ? (
              <p className="text-gray-400 text-center py-4">{t('patient.noSlots')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {slots.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedSlot(s); setStep(4) }}
                    className={`p-3 text-left border-2 rounded-lg hover:border-blue-500 transition-colors ${selectedSlot?.id === s.id ? 'border-blue-500 bg-blue-50' : ''}`}
                  >
                    <p className="font-medium text-sm">{format(new Date(s.start_datetime), 'EEE dd/MM', { locale: dateLocale })}</p>
                    <p className="text-xs text-gray-600">{format(new Date(s.start_datetime), 'HH:mm')} — {format(new Date(s.end_datetime), 'HH:mm')}</p>
                    <p className="text-xs text-gray-400">{s.duration_minutes} min</p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setStep(3)}><ChevronLeft className="h-4 w-4" /></Button>
              <CardTitle>{t('patient.confirmBooking')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('patient.typeLabel')}</span>
                <Badge>{typeLabel}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('patient.specialtyLabel')}</span>
                <span className="font-medium">{selectedSpecialty?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('patient.doctorLabel')}</span>
                <span className="font-medium">Dr. {selectedDoctor?.first_name} {selectedDoctor?.last_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('patient.dateTimeLabel')}</span>
                <span className="font-medium">
                  {selectedSlot && format(new Date(selectedSlot.start_datetime), "dd/MM/yyyy 'alle' HH:mm", { locale: dateLocale })}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('patient.visitReason')}</Label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('patient.visitReasonPlaceholder')}
                rows={3}
              />
            </div>
            <Button className="w-full" onClick={handleBook} disabled={loading}>
              {loading ? t('patient.bookingInProgress') : t('patient.confirmBookingBtn')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
