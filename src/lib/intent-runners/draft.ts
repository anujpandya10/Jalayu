/**
 * Draft intent runner — Jalayu's writer.
 *
 * No web search, no citations. The user wants something *written*:
 * an email, a reply, a message, a paragraph, a one-liner. The runner
 * produces the cleanest possible draft in markdown, ready to copy.
 */
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MODEL = 'claude-sonnet-4-20250514'

const SYSTEM_PROMPT = `You are Jalayu's writer. Someone fired you an intent like "draft a reply to my landlord about the broken heater" or "write a one-line response to this slack message." Your job is to produce the draft. Nothing else.

Rules:
- Output the draft itself, ready to copy. No preamble ("Here's a draft for you…"), no commentary, no offering of alternatives unless the user asked for variants.
- Match the implied medium and tone. A landlord reply is formal-but-direct. A Slack response is short and casual. An email to mom is warm. Read the intent, don't ask.
- If the intent is "draft an email to X about Y," include a subject line as a markdown bold first line, then a blank line, then the body. If it's a chat message, just the message text.
- Don't sign anything (no "Best, Anuj"). The user inserts their own signature.
- Length: as short as possible while doing the job. A two-line message beats a three-paragraph one if both work.
- If the intent is too vague to write a real draft (e.g. "draft something nice"), produce your best guess in italics with a one-line "Assumed: …" at the end.
- After the draft, on a new line, add exactly: "---" then a single line starting with "Bottom line:" summarising what the draft does in 8 words or fewer. This is for the ledger row, not the user.`

export interface DraftResult {
  resultMd: string
  resultSummary: string
  model: string
}

export async function runDraftIntent(
  intentText: string,
  memoryContext: string = '',
): Promise<DraftResult> {
  const system = memoryContext ? `${SYSTEM_PROMPT}${memoryContext}` : SYSTEM_PROMPT
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: intentText }],
  })

  let raw = ''
  for (const block of resp.content) {
    if (block.type === 'text') raw += block.text
  }
  raw = raw.trim()
  if (!raw) throw new Error('Draft runner produced no text output')

  // Split on the "---" separator. Everything before = the draft; after = the bottom line.
  const sepIndex = raw.lastIndexOf('\n---')
  let resultMd = raw
  let summary = ''
  if (sepIndex > 0) {
    resultMd = raw.slice(0, sepIndex).trim()
    const tail = raw.slice(sepIndex + 4).trim()
    const m = tail.match(/Bottom line:\s*(.+)/i)
    if (m) summary = m[1].trim()
  }
  if (!summary) {
    // Fallback: first non-empty line of the draft, prefixed
    const firstLine = resultMd
      .split('\n')
      .map((l) => l.replace(/^\*\*|^[#>*_-]+/, '').trim())
      .find((l) => l.length > 0) || ''
    summary = firstLine.length > 80 ? `Draft: ${firstLine.slice(0, 77)}…` : `Draft: ${firstLine}`
  }
  if (summary.length > 200) summary = summary.slice(0, 197) + '…'

  return { resultMd, resultSummary: summary, model: MODEL }
}
