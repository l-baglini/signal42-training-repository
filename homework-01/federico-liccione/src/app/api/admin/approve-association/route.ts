import { createServerClient } from '@supabase/ssr'
import { getAdminClient } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const admin = getAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { requestId, action, adminNote } = await request.json() as {
    requestId: string
    action: 'approved' | 'rejected'
    adminNote?: string
  }

  const { data: req, error: updateError } = await admin
    .from('association_requests')
    .update({ status: action, admin_notes: adminNote ?? null, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('user_id')
    .single()

  if (updateError || !req) {
    return NextResponse.json({ error: updateError?.message ?? 'Richiesta non trovata' }, { status: 500 })
  }

  if (action === 'approved') {
    await admin
      .from('profiles')
      .update({ role: 'association', updated_at: new Date().toISOString() })
      .eq('id', req.user_id)
  }

  return NextResponse.json({ ok: true })
}
