import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import webpush from 'web-push'

function verifyCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

type NudgeType = 'mood_check' | 'task_reminder' | 'reflection_prompt'

const NUDGE_CONTENT: Record<NudgeType, { title: string; body: string }> = {
  mood_check: {
    title: 'How are you feeling?',
    body: 'Take 3 seconds to check in. Jalayu is listening.',
  },
  task_reminder: {
    title: "You've got things to do",
    body: 'A few tasks are waiting for you today.',
  },
  reflection_prompt: {
    title: 'End of day',
    body: 'How did today go? A quick reflection takes 60 seconds.',
  },
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
  const utcHour = now.getUTCHours()
  const todayStart = utcDayStart(now)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // 1. Fetch users with push subscriptions who were active within 30 days
  const { data: activeSubs, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .not('user_id', 'is', null)

  if (subsErr) {
    console.error('push_subscriptions fetch error', subsErr)
    return NextResponse.json({ error: subsErr.message }, { status: 500 })
  }

  if (!activeSubs?.length) {
    return NextResponse.json({ ok: true, nudgesSent: 0 })
  }

  // Get unique user IDs from subscriptions
  const subUserIds = [...new Set(activeSubs.map((s) => s.user_id as string))]

  // Filter to users active within 30 days
  const { data: activeProfiles } = await admin
    .from('profiles')
    .select('id, last_active')
    .in('id', subUserIds)
    .gte('last_active', thirtyDaysAgo.toISOString())

  const activeUserIds = new Set((activeProfiles ?? []).map((p) => p.id as string))

  if (activeUserIds.size === 0) {
    return NextResponse.json({ ok: true, nudgesSent: 0 })
  }

  // 2. Determine which nudges qualify based on current UTC hour
  const qualifyingNudgeTypes: NudgeType[] = []

  // mood_check: 8am–10am UTC or 6pm–8pm UTC
  if ((utcHour >= 8 && utcHour < 10) || (utcHour >= 18 && utcHour < 20)) {
    qualifyingNudgeTypes.push('mood_check')
  }

  // task_reminder: 9am–11am UTC
  if (utcHour >= 9 && utcHour < 11) {
    qualifyingNudgeTypes.push('task_reminder')
  }

  // reflection_prompt: after 8pm UTC
  if (utcHour >= 20) {
    qualifyingNudgeTypes.push('reflection_prompt')
  }

  if (qualifyingNudgeTypes.length === 0) {
    return NextResponse.json({ ok: true, nudgesSent: 0 })
  }

  let nudgesSent = 0

  for (const userId of activeUserIds) {
    // Fetch nudge log for this user today
    const { data: todayLogs } = await admin
      .from('nudge_log')
      .select('nudge_type')
      .eq('user_id', userId)
      .gte('sent_at', todayStart.toISOString())

    const sentTodayTypes = new Set((todayLogs ?? []).map((l) => l.nudge_type as string))

    // Get subscriptions for this user
    const userSubs = activeSubs.filter((s) => s.user_id === userId)
    if (!userSubs.length) continue

    for (const nudgeType of qualifyingNudgeTypes) {
      // Skip if already sent today
      if (sentTodayTypes.has(nudgeType)) continue

      // Additional checks per nudge type
      if (nudgeType === 'mood_check') {
        // Check user hasn't logged a mood today
        const { data: moodLogs } = await admin
          .from('moods')
          .select('id')
          .eq('user_id', userId)
          .gte('created_at', todayStart.toISOString())
          .limit(1)
        if (moodLogs && moodLogs.length > 0) continue
      }

      if (nudgeType === 'task_reminder') {
        // Check user has pending tasks due today
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
        const { data: dueTasks } = await admin
          .from('tasks')
          .select('id')
          .eq('user_id', userId)
          .eq('completed', false)
          .gte('due_date', todayStart.toISOString().slice(0, 10))
          .lt('due_date', todayEnd.toISOString().slice(0, 10))
          .limit(1)
        if (!dueTasks || dueTasks.length === 0) continue
      }

      if (nudgeType === 'reflection_prompt') {
        // Check user hasn't saved a reflection today
        const { data: reflections } = await admin
          .from('reflections')
          .select('id')
          .eq('user_id', userId)
          .eq('date', todayStart.toISOString().slice(0, 10))
          .limit(1)
        if (reflections && reflections.length > 0) continue
      }

      const content = NUDGE_CONTENT[nudgeType]
      const payload = JSON.stringify({ title: content.title, body: content.body })

      // Send push notification to all user subscriptions
      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          )
          nudgesSent++
        } catch (e) {
          console.error('nudge push failed', sub.endpoint, e)
          if (e && typeof e === 'object' && 'statusCode' in e && (e as { statusCode: number }).statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      }

      // Insert nudge log row
      await admin.from('nudge_log').insert({
        user_id: userId,
        nudge_type: nudgeType,
        sent_at: now.toISOString(),
      })
    }
  }

  return NextResponse.json({ ok: true, nudgesSent })
}
