import apiClient from './client'
import type { Appointment, Doctor, Slot, Specialty } from '@/types'

export const appointmentsApi = {
  book: (data: { slot_id: number; appointment_type: string; reason?: string }) =>
    apiClient.post<Appointment>('/appointments/', data).then(r => r.data),

  getMyAppointments: (params?: { status?: string; type?: string }) =>
    apiClient.get<Appointment[]>('/appointments/my-appointments', { params }).then(r => r.data),

  getById: (id: string) => apiClient.get<Appointment>(`/appointments/${id}`).then(r => r.data),

  cancel: (id: string, reason?: string) =>
    apiClient.put<Appointment>(`/appointments/${id}/cancel`, { cancellation_reason: reason }).then(r => r.data),

  complete: (id: string) =>
    apiClient.put<Appointment>(`/appointments/${id}/complete`).then(r => r.data),
}

export const doctorsApi = {
  list: (specialty_id?: number) =>
    apiClient.get<Doctor[]>('/doctors', { params: specialty_id ? { specialty_id } : {} }).then(r => r.data),

  getById: (id: number) => apiClient.get<Doctor>(`/doctors/${id}`).then(r => r.data),

  getSlots: (doctorId: number, params?: { date_from?: string; date_to?: string; type?: string }) =>
    apiClient.get<Slot[]>(`/doctors/${doctorId}/slots`, { params }).then(r => r.data),
}

export const specialtiesApi = {
  list: () => apiClient.get<Specialty[]>('/specialties').then(r => r.data),
}

export const slotsApi = {
  getAvailable: (params?: { doctor_id?: number; date_from?: string; date_to?: string; type?: string }) =>
    apiClient.get<Slot[]>('/slots/available', { params }).then(r => r.data),

  getMySlots: () => apiClient.get<Slot[]>('/slots/my-slots').then(r => r.data),

  create: (data: { start_datetime: string; end_datetime: string; slot_type: string; duration_minutes: number }) =>
    apiClient.post<Slot>('/slots/', data).then(r => r.data),

  update: (id: number, data: Partial<{ start_datetime: string; end_datetime: string; slot_type: string; duration_minutes: number }>) =>
    apiClient.put<Slot>(`/slots/${id}`, data).then(r => r.data),

  delete: (id: number) => apiClient.delete(`/slots/${id}`),
}
