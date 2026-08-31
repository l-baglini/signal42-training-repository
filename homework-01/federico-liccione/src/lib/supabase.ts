import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy singletons — avoids "supabaseUrl is required" during Next.js build
let _public: SupabaseClient | null = null
let _admin: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_public) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase env vars not set')
    _public = createClient(url, key)
  }
  return _public
}

// Admin client — server-side only (scrapers, API routes)
export function getAdminClient(): SupabaseClient {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase admin env vars not set')
    _admin = createClient(url, key, { auth: { persistSession: false } })
  }
  return _admin
}
