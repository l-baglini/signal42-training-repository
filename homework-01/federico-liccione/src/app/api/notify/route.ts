import { getAdminClient } from '@/lib/supabase'
import nodemailer from 'nodemailer'
import { NextResponse, type NextRequest } from 'next/server'
import type { Event } from '@/types/event'
import { filterEvents } from '@/lib/filterEvents'

const transporter = nodemailer.createTransport({
  host: 'smtp.resend.com',
  port: 465,
  secure: true,
  auth: {
    user: 'resend',
    pass: process.env.RESEND_API_KEY,
  },
})

const FROM_EMAIL = process.env.NOTIFY_FROM_EMAIL ?? 'ProtestApp <onboarding@resend.dev>'

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminClient()

  // Events inserted in the last 25h (slight overlap to avoid gaps between runs)
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  const { data: newEvents } = await db
    .from('events')
    .select('*')
    .gte('created_at', since)
    .order('start_date', { ascending: true })

  if (!newEvents?.length) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'no new events' })
  }

  // Users with email notifications enabled, not yet notified in the last 23h
  const notifiedSince = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()
  const { data: prefs } = await db
    .from('notification_preferences')
    .select('*, profiles(email)')
    .eq('email_enabled', true)
    .or(`last_notified_at.is.null,last_notified_at.lt.${notifiedSince}`)

  if (!prefs?.length) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'no eligible users' })
  }

  let sent = 0

  for (const pref of prefs) {
    const profile = pref.profiles as { email: string | null } | null
    const email = profile?.email
    if (!email) continue

    const matching = filterEvents(newEvents as Event[], {
      regions: pref.regions ?? [],
      event_types: pref.event_types ?? [],
      tags: pref.tags ?? [],
    })
    if (!matching.length) continue

    try {
      await transporter.sendMail({
        from: FROM_EMAIL,
        to: email,
        subject: `${matching.length} nuov${matching.length === 1 ? 'o evento' : 'i eventi'} su ProtestApp`,
        html: buildEmailHtml(matching),
      })

      await db
        .from('notification_preferences')
        .update({ last_notified_at: new Date().toISOString() })
        .eq('user_id', pref.user_id)

      sent++
    } catch {
      // continue to next user on send failure
    }
  }

  return NextResponse.json({ ok: true, sent })
}

function buildEmailHtml(events: Event[]): string {
  const rows = events.map((ev) => {
    const date = ev.start_date
      ? new Date(ev.start_date).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' })
      : 'Data da definire'
    const location = [ev.city, ev.region].filter(Boolean).join(', ') || ev.location_text || '—'
    const typeLabel: Record<string, string> = {
      sciopero: 'Sciopero', manifestazione: 'Manifestazione',
      corteo: 'Corteo', presidio: 'Presidio', altro: 'Altro',
    }
    const link = ev.source_url
      ? `<a href="${ev.source_url}" style="color:#2563eb;text-decoration:none">Fonte →</a>`
      : ''

    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;vertical-align:top">
          <div style="font-size:11px;color:#6b7280;margin-bottom:2px">
            ${typeLabel[ev.event_type] ?? 'Altro'} · ${location}
          </div>
          <div style="font-size:15px;font-weight:600;color:#111827;margin-bottom:2px">
            ${ev.title}
          </div>
          <div style="font-size:12px;color:#6b7280">
            📅 ${date}${link ? `&nbsp;&nbsp;${link}` : ''}
          </div>
        </td>
      </tr>`
  }).join('')

  return `
    <!DOCTYPE html>
    <html lang="it">
    <body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,sans-serif">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">

            <tr>
              <td style="background:#1f2937;padding:20px 24px">
                <span style="font-size:18px;font-weight:700;color:#fef3c7">✊ ProtestApp</span>
                <span style="font-size:12px;color:#9ca3af;margin-left:12px">Nuovi eventi sul tuo territorio</span>
              </td>
            </tr>

            <tr>
              <td style="padding:24px">
                <p style="margin:0 0 20px;font-size:14px;color:#374151">
                  Ci sono <strong>${events.length} nuov${events.length === 1 ? 'o evento' : 'i eventi'}</strong>
                  che corrispondono alle tue preferenze:
                </p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  ${rows}
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px;border-top:1px solid #f0f0f0;text-align:center">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://protestapp.vercel.app'}"
                   style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500">
                  Apri la mappa
                </a>
                <p style="margin:12px 0 0;font-size:11px;color:#9ca3af">
                  Gestisci le tue preferenze su
                  <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://protestapp.vercel.app'}/profilo"
                     style="color:#6b7280">protestapp.vercel.app/profilo</a>
                </p>
              </td>
            </tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>`
}
