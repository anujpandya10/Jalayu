/**
 * Turn raw AI-provider errors into a clear, specific, non-scary line for users.
 * Keeps the real cause visible (so it's actionable) without dumping JSON.
 */
export function humanizeAIError(raw: string | null | undefined): string {
  if (!raw) return 'Something went wrong reaching the AI. Try again in a moment.'
  const s = raw.toLowerCase()

  if (s.includes('credit balance') || s.includes('billing') || s.includes('quota') || s.includes('insufficient_quota')) {
    return 'Your AI agent is out of credits. Top up your provider account, or connect a different agent in Settings → Connect your agent.'
  }
  if (s.includes('rate limit') || s.includes('rate_limit') || s.includes('429') || s.includes('overloaded')) {
    return 'Your AI agent is busy right now (rate limited). Give it a few seconds and try again.'
  }
  if (s.includes('authentication') || s.includes('invalid x-api-key') || s.includes('invalid api key') || s.includes('401') || s.includes('permission')) {
    return 'Your AI key looks invalid or expired. Reconnect your agent in Settings → Connect your agent.'
  }
  if (s.includes('no agent') || s.includes('not configured') || s.includes('no api key') || s.includes('missing api key')) {
    return 'No AI agent is connected yet. Add yours in Settings → Connect your agent (Claude, Gemini, or ChatGPT).'
  }
  if (s.includes('timeout') || s.includes('timed out') || s.includes('econnreset') || s.includes('fetch failed')) {
    return 'The AI took too long to respond. Try again — it usually goes through on a retry.'
  }
  // Unknown: keep it short and human, not a raw payload
  return 'The AI couldn\'t finish this one. Try again, and if it keeps happening, check your agent in Settings.'
}
