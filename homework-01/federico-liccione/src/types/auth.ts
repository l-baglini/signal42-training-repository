export type UserRole = 'user' | 'association' | 'admin'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface NotificationPreferences {
  id: string
  user_id: string
  regions: string[]
  event_types: string[]
  tags: string[]
  email_enabled: boolean
  created_at: string
  updated_at: string
}

export interface AssociationRequest {
  id: string
  user_id: string
  org_name: string
  org_website: string | null
  org_description: string
  contact_email: string
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  updated_at: string
}

export interface SubmittedEvent {
  id: string
  submitted_by: string | null
  title: string
  description: string | null
  event_type: string
  tags: string[]
  location_text: string | null
  city: string | null
  region: string | null
  start_date: string | null
  end_date: string | null
  source_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  updated_at: string
}
