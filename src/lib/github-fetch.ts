/**
 * GitHub fetch helper — pulls just enough of a public repo into memory
 * to brief Claude on what's actually there.
 *
 * No git clone. No sandbox. Just the public REST API + raw.githubusercontent.
 * Unauthenticated rate limit is 60/hr; set GITHUB_TOKEN env var to bump to 5000/hr.
 *
 *   parseGithubRef("fix the bug in https://github.com/anujpandya10/jalayu/blob/main/src/app/page.tsx")
 *     → { owner: 'anujpandya10', repo: 'jalayu', hintedPath: 'src/app/page.tsx' }
 *
 *   fetchRepoContext(ref, hints)
 *     → { meta, readme, files: [{ path, content, truncated }] }
 *        capped at ~50k chars total so Claude has room to think
 */

const MAX_FILES = 12
const MAX_TOTAL_CHARS = 50_000
const MAX_FILE_CHARS = 8_000

const ENTRY_POINT_CANDIDATES = [
  'package.json',
  'CLAUDE.md',
  'AGENTS.md',
  'src/app/page.tsx',
  'src/app/layout.tsx',
  'src/index.ts',
  'src/index.tsx',
  'src/main.ts',
  'src/main.tsx',
  'src/App.tsx',
  'main.py',
  'app.py',
  'index.js',
  'index.ts',
]

export interface GithubRef {
  owner: string
  repo: string
  hintedPaths: string[]
  branch?: string
}

export interface RepoFile {
  path: string
  content: string
  truncated: boolean
}

export interface RepoContext {
  meta: {
    fullName: string
    description: string | null
    defaultBranch: string
    primaryLanguage: string | null
    htmlUrl: string
  }
  readme: string | null
  files: RepoFile[]
  totalChars: number
  rateLimitNote: string | null
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'jalayu-shadow' }
  const token = process.env.GITHUB_TOKEN
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

/**
 * Pull github URLs and hinted file paths out of free-form intent text.
 * Returns null if no github URL is present.
 */
export function parseGithubRef(text: string): GithubRef | null {
  // Match github.com URLs with optional /blob/<branch>/<path> or /tree/<branch>/<path>
  const re = /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:\/(?:blob|tree)\/([^/\s)]+)((?:\/[A-Za-z0-9._\/-]+)?))?/g
  let owner = ''
  let repo = ''
  let branch: string | undefined
  const hintedPaths = new Set<string>()

  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (!owner) { owner = m[1]; repo = m[2] }
    if (!branch && m[3]) branch = m[3]
    const path = m[4]?.replace(/^\//, '')
    if (path) hintedPaths.add(path)
  }

  if (!owner || !repo) return null

  // Also pull bare-ish file paths that look like source files mentioned anywhere
  const pathRe = /\b([A-Za-z0-9_/-]+\/[A-Za-z0-9_-]+\.[a-zA-Z]{1,6})\b/g
  while ((m = pathRe.exec(text)) !== null) {
    const candidate = m[1]
    // Skip obvious URL fragments we already captured
    if (candidate.includes('github.com')) continue
    hintedPaths.add(candidate)
  }

  return { owner, repo, hintedPaths: [...hintedPaths], branch }
}

async function fetchJson<T>(url: string): Promise<{ ok: boolean; status: number; data?: T; remaining?: string }> {
  const res = await fetch(url, { headers: authHeaders() })
  const remaining = res.headers.get('x-ratelimit-remaining') ?? undefined
  if (!res.ok) return { ok: false, status: res.status, remaining: remaining ?? undefined }
  const data = (await res.json()) as T
  return { ok: true, status: res.status, data, remaining }
}

async function fetchRaw(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
  const headers: Record<string, string> = { 'User-Agent': 'jalayu-shadow' }
  const token = process.env.GITHUB_TOKEN
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url, { headers })
  if (!res.ok) return null
  return await res.text()
}

interface RepoMetaResponse {
  full_name: string
  description: string | null
  default_branch: string
  language: string | null
  html_url: string
}

interface ReadmeResponse {
  content: string
  encoding: string
}

interface TreeResponse {
  tree: { path: string; type: string; size?: number }[]
  truncated: boolean
}

/**
 * Pull the slice of repo state that's relevant to the change.
 */
export async function fetchRepoContext(ref: GithubRef): Promise<RepoContext> {
  // 1. Repo metadata + default branch
  const metaRes = await fetchJson<RepoMetaResponse>(`https://api.github.com/repos/${ref.owner}/${ref.repo}`)
  if (!metaRes.ok || !metaRes.data) {
    throw new Error(
      metaRes.status === 404
        ? `Repo ${ref.owner}/${ref.repo} not found or private`
        : metaRes.status === 403
        ? `GitHub rate-limited (set GITHUB_TOKEN env var to raise limit)`
        : `GitHub repo fetch failed (${metaRes.status})`,
    )
  }
  const branch = ref.branch || metaRes.data.default_branch

  // 2. README (best-effort; may be missing)
  const readmeMeta = await fetchJson<ReadmeResponse>(`https://api.github.com/repos/${ref.owner}/${ref.repo}/readme?ref=${branch}`)
  let readme: string | null = null
  if (readmeMeta.ok && readmeMeta.data && readmeMeta.data.encoding === 'base64') {
    try {
      readme = Buffer.from(readmeMeta.data.content, 'base64').toString('utf8').slice(0, MAX_FILE_CHARS)
    } catch { /* skip */ }
  }

  // 3. Resolve file candidates — hinted paths first, then entry points that exist
  const candidates: string[] = [...ref.hintedPaths]

  // Pull tree to validate which entry points actually exist
  const tree = await fetchJson<TreeResponse>(`https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${branch}?recursive=1`)
  const treePaths = new Set<string>()
  if (tree.ok && tree.data?.tree) {
    for (const node of tree.data.tree) {
      if (node.type === 'blob') treePaths.add(node.path)
    }
  }

  for (const candidate of ENTRY_POINT_CANDIDATES) {
    if (candidates.length >= MAX_FILES) break
    if (!candidates.includes(candidate) && treePaths.has(candidate)) {
      candidates.push(candidate)
    }
  }

  // 4. Fetch each candidate's raw content
  const files: RepoFile[] = []
  let totalChars = readme?.length ?? 0
  for (const path of candidates.slice(0, MAX_FILES)) {
    if (totalChars >= MAX_TOTAL_CHARS) break
    const raw = await fetchRaw(ref.owner, ref.repo, branch, path)
    if (raw == null) continue
    const remaining = MAX_TOTAL_CHARS - totalChars
    const slice = raw.slice(0, Math.min(MAX_FILE_CHARS, remaining))
    const truncated = slice.length < raw.length
    files.push({ path, content: slice, truncated })
    totalChars += slice.length
  }

  const remainingHeader = metaRes.remaining ?? readmeMeta.remaining ?? tree.remaining
  const rateLimitNote =
    remainingHeader && Number(remainingHeader) < 10
      ? `GitHub rate limit nearly exhausted (${remainingHeader} requests left). Set GITHUB_TOKEN to raise it.`
      : null

  return {
    meta: {
      fullName: metaRes.data.full_name,
      description: metaRes.data.description,
      defaultBranch: metaRes.data.default_branch,
      primaryLanguage: metaRes.data.language,
      htmlUrl: metaRes.data.html_url,
    },
    readme,
    files,
    totalChars,
    rateLimitNote,
  }
}

/**
 * Render the repo context as a single markdown-ish block for the prompt.
 */
export function formatRepoContextForPrompt(ctx: RepoContext): string {
  const lines: string[] = []
  lines.push(`[REPOSITORY CONTEXT]`)
  lines.push(`Repo: ${ctx.meta.fullName}`)
  if (ctx.meta.description) lines.push(`Description: ${ctx.meta.description}`)
  lines.push(`Default branch: ${ctx.meta.defaultBranch}`)
  if (ctx.meta.primaryLanguage) lines.push(`Primary language: ${ctx.meta.primaryLanguage}`)
  if (ctx.rateLimitNote) lines.push(`Note: ${ctx.rateLimitNote}`)
  if (ctx.readme) {
    lines.push('')
    lines.push('--- README (truncated) ---')
    lines.push(ctx.readme)
  }
  for (const f of ctx.files) {
    lines.push('')
    lines.push(`--- FILE: ${f.path}${f.truncated ? ' (truncated)' : ''} ---`)
    lines.push(f.content)
  }
  return lines.join('\n')
}
