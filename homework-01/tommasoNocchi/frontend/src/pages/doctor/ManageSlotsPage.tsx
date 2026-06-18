import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { slotsApi } from '@/api/appointments'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/useDateLocale'
import type { Slot, SlotType } from '@/types'
import { format, addWeeks } from 'date-fns'

interface SlotForm {
  start_datetime: string
  end_datetime: string
  slot_type: SlotType
  duration_minutes: number
  repeat_weeks: number
}

const defaultForm: SlotForm = {
  start_datetime: '',
  end_datetime: '',
  slot_type: 'visit',
  duration_minutes: 30,
  repeat_weeks: 0,
}

export default function ManageSlotsPage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<SlotForm>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Slot | null>(null)
  const [error, setError] = useState('')
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  const load = () => {
    setLoading(true)
    slotsApi.getMySlots().then(setSlots).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!form.start_datetime || !form.end_datetime) return
    setSaving(true)
    setError('')
    try {
      const weeks = form.repeat_weeks || 0
      for (let w = 0; w <= weeks; w++) {
        const start = addWeeks(new Date(form.start_datetime), w)
        const end = addWeeks(new Date(form.end_datetime), w)
        await slotsApi.create({
          start_datetime: start.toISOString(),
          end_datetime: end.toISOString(),
          slot_type: form.slot_type,
          duration_minutes: form.duration_minutes,
        })
      }
      setShowForm(false)
      setForm(defaultForm)
      load()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await slotsApi.delete(deleteTarget.id)
    setDeleteTarget(null)
    load()
  }

  const grouped = slots.reduce((acc, slot) => {
    const day = format(new Date(slot.start_datetime), 'yyyy-MM-dd')
    if (!acc[day]) acc[day] = []
    acc[day].push(slot)
    return acc
  }, {} as Record<string, Slot[]>)

  const sortedDays = Object.keys(grouped).sort()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('doctor.manageSlots')}</h1>
          <p className="text-gray-500">{t('doctor.manageSlotsDesc')}</p>
        </div>
        <Button onClick={() => { setShowForm(true); setForm(defaultForm) }}>
          <Plus className="h-4 w-4 mr-1" /> {t('doctor.addSlot')}
        </Button>
      </div>

      {loading ? <p className="text-gray-400">{t('common.loading')}</p> : sortedDays.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-gray-400 mb-4">{t('doctor.noSlots')}</p>
            <Button onClick={() => setShowForm(true)}>{t('doctor.addFirstSlot')}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedDays.map(day => (
            <Card key={day}>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold text-gray-600">
                  {format(new Date(day + 'T12:00:00'), 'EEEE dd MMMM yyyy', { locale: dateLocale })}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {grouped[day].sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()).map(slot => (
                    <div key={slot.id} className={`flex items-center justify-between p-3 rounded-lg border ${slot.is_available ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div>
                        <p className="text-sm font-medium">
                          {format(new Date(slot.start_datetime), 'HH:mm')} — {format(new Date(slot.end_datetime), 'HH:mm')}
                        </p>
                        <div className="flex gap-1 mt-1">
                          <Badge variant={slot.slot_type === 'procedure' ? 'secondary' : 'outline'} className="text-xs">
                            {slot.slot_type === 'procedure' ? t('common.procedure') : t('common.visit')}
                          </Badge>
                          <Badge variant={slot.is_available ? 'success' : 'destructive'} className="text-xs">
                            {slot.is_available ? t('doctor.free') : t('doctor.booked')}
                          </Badge>
                        </div>
                      </div>
                      {slot.is_available && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget(slot)}>
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('doctor.addSlotTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('doctor.start')}</Label>
                <Input
                  type="datetime-local"
                  value={form.start_datetime}
                  onChange={e => setForm(f => ({ ...f, start_datetime: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('doctor.end')}</Label>
                <Input
                  type="datetime-local"
                  value={form.end_datetime}
                  onChange={e => setForm(f => ({ ...f, end_datetime: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('doctor.type')}</Label>
              <Select value={form.slot_type} onValueChange={(v) => setForm(f => ({ ...f, slot_type: v as SlotType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visit">{t('common.visit')}</SelectItem>
                  <SelectItem value="procedure">{t('common.procedure')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('doctor.durationMinutes')}</Label>
              <Input
                type="number"
                value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('doctor.repeatWeeks')}</Label>
              <Input
                type="number"
                min={0}
                max={52}
                value={form.repeat_weeks}
                onChange={e => setForm(f => ({ ...f, repeat_weeks: parseInt(e.target.value) }))}
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('doctor.cancel')}</Button>
            <Button onClick={handleCreate} disabled={saving || !form.start_datetime || !form.end_datetime}>
              {saving ? t('doctor.creating') : `${t('doctor.create')}${form.repeat_weeks > 0 ? ` (${form.repeat_weeks + 1})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('doctor.deleteSlot')}</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">
            {deleteTarget && t('doctor.deleteConfirm', {
              date: format(new Date(deleteTarget.start_datetime), 'dd/MM/yyyy HH:mm', { locale: dateLocale }),
            })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('doctor.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t('doctor.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
