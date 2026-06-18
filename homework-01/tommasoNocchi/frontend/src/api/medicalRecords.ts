import apiClient from './client'
import type { PatientMedicalRecord, MedicalRecordEntry } from '@/types'

export const medicalRecordsApi = {
  getPatientRecord: (patientId: number) =>
    apiClient.get<PatientMedicalRecord>(`/patients/${patientId}/medical-record`).then(r => r.data),

  getPatientRecordBySpecialty: (patientId: number, specialtyId: number) =>
    apiClient.get<PatientMedicalRecord>(`/patients/${patientId}/medical-record/specialty/${specialtyId}`).then(r => r.data),

  createEntry: (appointmentId: string, data: { title: string; content: string; attachments?: unknown[] }) =>
    apiClient.post<MedicalRecordEntry>(`/appointments/${appointmentId}/medical-record-entry`, data).then(r => r.data),

  updateEntry: (entryId: string, data: { title?: string; content?: string; attachments?: unknown[] }) =>
    apiClient.put<MedicalRecordEntry>(`/medical-record-entries/${entryId}`, data).then(r => r.data),

  getPatientSummary: (patientId: number) =>
    apiClient.get(`/patients/${patientId}/appointments-summary`).then(r => r.data),
}
