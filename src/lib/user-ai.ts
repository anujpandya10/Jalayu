/**
 * Per-user AI agent resolution. Every AI call routes through the *user's* key
 * so no one ever spends the owner's credits. Server-only.
 *
 *   getUserAnthropic(userId) → Anthropic client for that user:
 *     1. their connected key (decrypted), else
 *     2. owner env key (only if the user IS the owner), else
 *     3. throws NoAgentError → callers surface "connect your agent".
 */
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase-admin'
import { decryptSecret } from '@/lib/crypto'
import { isOwnerEmail } from '@/lib/owner'

export class NoAgentError extends Error {
  constructor(message = 'No AI agent connected. Add your key in Settings → Connect your agent.') {
    super(message)
    this.name = 'NoAgentError'
  }
}

export interface VerifyResult { ok: boolean; error?: string }

/** Tiny auth+credits check on the user's own key (1 token). */
export async function verifyAnthropicKey(key: string): Promise<VerifyResult> {
  try {
    const client = new Anthropic({ apiKey: key })
    await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Verification failed' }
  }
}

export async function getUserAnthropic(userId: string): Promise<Anthropic> {
  const admin = createAdminClient()
  if (admin) {
    const { data } = await admin
      .from('user_ai_keys').select('provider, key_cipher').eq('user_id', userId).maybeSingle()
    if (data?.provider === 'anthropic' && data.key_cipher) {
      try { return new Anthropic({ apiKey: decryptSecret(data.key_cipher) }) } catch { /* fall through */ }
    }
    // Owner-only fallback to the platform env key
    try {
      const { data: u } = await admin.auth.admin.getUserById(userId)
      if (isOwnerEmail(u.user?.email) && process.env.ANTHROPIC_API_KEY) {
        return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      }
    } catch { /* ignore */ }
  } else if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  throw new NoAgentError()
}
