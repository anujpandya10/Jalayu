/**
 * Code intent runner — Jalayu's first-draft engineer.
 *
 * v1 is a *planner*, not an executor: it doesn't push commits. It reads
 * the referenced repo, understands the change you described, and writes
 * a precise file-by-file change plan with proposed code blocks. You read
 * it on your phone and apply on your laptop, or copy into Claude Code.
 *
 * v2 (later) will wrap this in a Vercel Sandbox flow that actually
 * applies the changes, runs tests, and opens a PR.
 */
import Anthropic from '@anthropic-ai/sdk'
import { parseGithubRef, fetchRepoContext, formatRepoContextForPrompt, type GithubRef } from '@/lib/github-fetch'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MODEL = 'claude-sonnet-4-20250514'

const SYSTEM_PROMPT = `You are Jalayu's engineer. The user fired an intent describing a code change they want made to a github repo. You have read-only access to the repo's metadata, README, and a curated slice of its source files. Your job is to produce a precise change plan — not a vibe summary.

Rules:
- Lead with a one-sentence restatement of what they're asking for, so they can see you understood. If they were ambiguous, state your reading and a one-line "Assumed:" note. Don't ask back-and-forth questions — they're not here.
- Then a file-by-file plan. For each file you'd touch:
   - Path as a markdown sub-heading.
   - 1–2 sentences on what changes and why.
   - A markdown code block with the proposed addition or replacement, scoped tightly (don't dump the whole file).
   - When replacing existing code, show enough surrounding context to make the edit unambiguous.
- If a file you'd need wasn't included in the context, say so explicitly: "I'd also need to see X to be sure about Y." Don't fabricate file contents.
- After all file changes: a short "Testing notes" section — what to verify before merging.
- Close with exactly: "---" then a single line "Bottom line:" summarising the change in 12 words or fewer.
- Length: as short as possible while being precise. A 3-file change in 200 words beats 800 words of restating context.
- NEVER produce changes that introduce secrets, hardcoded credentials, or destructive operations without naming the risk.
- If the request is fundamentally unclear or the repo doesn't seem to support what they asked, say so directly in the first paragraph rather than producing a half-baked plan.`

export interface CodeResult {
  resultMd: string
  resultSummary: string
  model: string
  repoRef: { fullName: string; defaultBranch: string; htmlUrl: string } | null
}

export async function runCodeIntent(
  intentText: string,
  memoryContext: string = '',
  userContext: string = '',
  client: Anthropic = anthropic,
): Promise<CodeResult> {
  const ref: GithubRef | null = parseGithubRef(intentText)
  if (!ref) {
    throw new Error('No github.com URL found in the intent. Paste a repo link so I know where to look.')
  }

  const repoCtx = await fetchRepoContext(ref)
  const repoBlock = formatRepoContextForPrompt(repoCtx)

  const system = `${SYSTEM_PROMPT}${userContext}${memoryContext}`

  const userMessage = `${repoBlock}\n\n[CHANGE REQUEST]\n${intentText}`

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: userMessage }],
  })

  let raw = ''
  for (const block of resp.content) {
    if (block.type === 'text') raw += block.text
  }
  raw = raw.trim()
  if (!raw) throw new Error('Code planner produced no text output')

  // Split on the "---" sentinel
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
    summary = `Plan for ${repoCtx.meta.fullName}: ${repoCtx.files.length} file${repoCtx.files.length === 1 ? '' : 's'} reviewed`
  }
  if (summary.length > 200) summary = summary.slice(0, 197) + '…'

  return {
    resultMd,
    resultSummary: summary,
    model: MODEL,
    repoRef: {
      fullName: repoCtx.meta.fullName,
      defaultBranch: repoCtx.meta.defaultBranch,
      htmlUrl: repoCtx.meta.htmlUrl,
    },
  }
}
