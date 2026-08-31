export type UserRole = 'patient' | 'doctor'
export type SlotType = 'visit' | 'procedure'
export type AppointmentType = 'visit' | 'procedure'
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export interface Specialty {
  id: number
  name: string
  description?: string
}

export interface DoctorProfile {
  id: number
  specialty_id: number
  specialty_name?: string
  bio?: string
  license_number?: string
  years_experience?: number
}

export interface PatientProfile {
  id: number
  date_of_birth?: string
  blood_type?: string
  allergies?: string
  fiscal_code?: string
}

export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  phone?: string
  role: UserRole
  is_active: boolean
  created_at: string
  doctor_profile?: DoctorProfile
  patient_profile?: PatientProfile
}

export interface Doctor {
  id: number
  first_name: string
  last_name: string
  specialty: Specialty
  bio?: string
  years_experience?: number
}

export interface Slot {
  id: number
  doctor_id: number
  start_datetime: string
  end_datetime: string
  slot_type: SlotType
  is_available: boolean
  duration_minutes: number
}

export interface DoctorBrief {
  id: number
  first_name: string
  last_name: string
  specialty_name?: string
}

export interface PatientBrief {
  id: number
  first_name: string
  last_name: string
}

export interface Appointment {
  id: string
  patient_id: number
  doctor_id: number
  slot_id: number
  appointment_type: AppointmentType
  status: AppointmentStatus
  reason?: string
  notes?: string
  created_at: string
  updated_at: string
  cancellation_reason?: string
  slot?: Slot
  doctor?: DoctorBrief
  patient?: PatientBrief
}

export interface MedicalRecordEntry {
  id: string
  appointment_id: string
  appointment_type?: AppointmentType
  entry_date: string
  title: string
  content: string
  attachments?: unknown[]
  doctor?: { id: number; first_name: string; last_name: string }
  created_at: string
  updated_at: string
}

export interface SpecialtyGroup {
  specialty_id: number
  specialty_name: string
  entries: MedicalRecordEntry[]
}

export interface PatientMedicalRecord {
  patient_id: number
  first_name: string
  last_name: string
  specialties: SpecialtyGroup[]
}
