import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import webpush from 'web-push'

function verifyCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

function timeMatchUtc(remindAt: string, now: Date, windowMinutes: number) {
  const t = new Date(remindAt)
  if (Number.isNaN(t.getTime())) return false
  const toMin = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes()
  let a = toMin(t)
  let b = toMin(now)
  let diff = Math.abs(b - a)
  diff = Math.min(diff, 1440 - diff)
  return diff <= windowMinutes
}

function sameUtcDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function reminderDueToday(r: { remind_at: string; days_of_week?: string[] | null }, now: Date) {
  if (!timeMatchUtc(String(r.remind_at), now, 6)) return false
  if (!r.days_of_week?.length) return true
  const key = DOW_KEYS[now.getUTCDay()]
  return r.days_of_week.includes(key)
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server not configured (service role)' }, { status: 503 })
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    return NextResponse.json({ skipped: true, reason: 'VAPID keys not set' })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@jalayu.app',
    publicKey,
    privateKey,
  )

  const now = new Date()
  const { data: reminders, error: rErr } = await admin
    .from('reminders')
    .select('id, user_id, title, remind_at, last_sent, is_active, days_of_week')
    .eq('is_active', true)

  if (rErr) {
    console.error(rErr)
    return NextResponse.json({ error: rErr.message }, { status: 500 })
  }

  let sent = 0
  const list = reminders || []

  for (const r of list) {
    if (!reminderDueToday(r, now)) continue
    if (r.last_sent && sameUtcDay(new Date(r.last_sent), now)) continue

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', r.user_id)

    if (!subs?.length) continue

    const payload = JSON.stringify({
      title: 'Jalayu reminder',
      body: r.title,
    })

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payload,
        )
        sent++
      } catch (e) {
        console.error('push failed', s.endpoint, e)
        if (e && typeof e === 'object' && 'statusCode' in e && (e as { statusCode: number }).statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }

    await admin
      .from('reminders')
      .update({ last_sent: now.toISOString() })
      .eq('id', r.id)
  }

  return NextResponse.json({ ok: true, checked: list.length, notificationsSent: sent })
}
