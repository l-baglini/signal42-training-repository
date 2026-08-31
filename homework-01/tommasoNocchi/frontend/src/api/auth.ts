import apiClient from './client'
import type { User } from '@/types'

export interface LoginPayload { email: string; password: string }
export interface RegisterPayload {
  email: string
  password: string
  role: 'patient' | 'doctor'
  first_name: string
  last_name: string
  phone?: string
  specialty_id?: number
  license_number?: string
  bio?: string
  years_experience?: number
  date_of_birth?: string
  blood_type?: string
  fiscal_code?: string
  allergies?: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export const authApi = {
  login: (data: LoginPayload) => apiClient.post<AuthResponse>('/auth/login', data).then(r => r.data),
  register: (data: RegisterPayload) => apiClient.post<AuthResponse>('/auth/register', data).then(r => r.data),
  logout: (refreshToken: string) => apiClient.post('/auth/logout', { refresh_token: refreshToken }),
  me: () => apiClient.get<User>('/auth/me').then(r => r.data),
}
