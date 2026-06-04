/**
 * Push notification helper — load a user's subscriptions and fan out.
 *
 * Used by intent runners (when work is done / failed) and by cron jobs
 * (reminders, nudges). Centralised so every surface uses the same
 * VAPID config, the same 410-cleanup, and the same error logging.
 */
import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

let vapidConfigured = false
let vapidAvailable: boolean | null = null

function ensureVapid(): boolean {
  if (vapidAvailable !== null) return vapidAvailable
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    vapidAvailable = false
    return false
  }
  if (!vapidConfigured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:support@jalayu.app',
      publicKey,
      privateKey,
    )
    vapidConfigured = true
  }
  vapidAvailable = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

export interface PushResult {
  attempted: number
  sent: number
  removed: number
}

interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Send a push to every subscription registered for `userId`.
 * Silently no-ops if VAPID keys are not configured (dev / preview envs).
 */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  if (!ensureVapid()) {
    return { attempted: 0, sent: 0, removed: 0 }
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error || !subs || subs.length === 0) {
    return { attempted: 0, sent: 0, removed: 0 }
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/dashboard',
  })

  let sent = 0
  let removed = 0

  await Promise.all(
    (subs as PushSubscriptionRow[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        )
        sent++
      } catch (e) {
        const statusCode =
          e && typeof e === 'object' && 'statusCode' in e
            ? (e as { statusCode: number }).statusCode
            : undefined
        if (statusCode === 404 || statusCode === 410) {
          // Subscription dead — remove so we stop retrying
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          removed++
        } else {
          console.warn('[push] send failed', s.endpoint.slice(-12), statusCode ?? e)
        }
      }
    }),
  )

  return { attempted: subs.length, sent, removed }
}
