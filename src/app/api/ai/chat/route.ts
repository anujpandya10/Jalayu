import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { detectLanguage, langInstruction } from '@/lib/language'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function toneFromProfile(workType: string | null, struggles: string[] | null) {
  const w = workType || ''
  const s = (struggles || []).join(' ').toLowerCase()
  if (s.includes('mood') || s.includes('anxious') || s.includes('overwhelm')) {
    return 'Use a gentler pace, shorter sentences, and validate feelings before suggestions.'
  }
  if (w === 'build' || w === 'create') {
    return 'Be direct and momentum-focused; celebrate shipped work.'
  }
  if (w === 'people' || w === 'learn') {
    return 'Be curious and relational; connect advice to people and learning.'
  }
  return 'Be warm, concise, and specific to their data.'
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { messages, explainWhy } = body as {
      messages: { role: string; content: string }[]
      explainWhy?: boolean
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          },
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const today = new Date().toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [profileRes, moodsRes, tasksRes, notesRes, factsRes, threadRes, healthRes, medsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('moods').select('*').eq('user_id', user.id).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(14),
      supabase.from('tasks').select('*').eq('user_id', user.id).eq('completed', false).gte('due_date', today).limit(10),
      supabase.from('notes').select('content, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('chat_memory_facts').select('fact').eq('user_id', user.id).order('created_at', { ascending: false }).limit(14),
      supabase.from('chat_messages').select('role, content').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('health_profiles').select('*').eq('user_id', user.id).order('created_at', { ascending: true }).limit(10),
      supabase.from('medications').select('name, dosage_mg, frequency, purpose').eq('user_id', user.id).eq('is_active', true).limit(20),
    ])

    const profile = profileRes.data
    const moods = moodsRes.data || []
    const incompleteTasks = tasksRes.data || []
    const recentNotes = notesRes.data || []
    const facts = (factsRes.data || []).map((f) => f.fact)
    const thread = (threadRes.data || []).reverse()
    const healthProfiles: any[] = healthRes.data || []
    const activeMeds = medsRes.data || []

    // Language detection: check last 5 user messages
    const recentUserMessages = messages.filter((m) => m.role === 'user').slice(-5).map((m) => m.content)
    const detectedLang = detectLanguage(recentUserMessages) || profile?.preferred_language || 'en'
    const langLine = langInstruction(detectedLang)

    const avgMood = moods.length
      ? (moods.reduce((sum, m) => sum + m.score, 0) / moods.length).toFixed(1)
      : null

    const threadBlock =
      thread.length > 0
        ? thread.map((m) => `${m.role}: ${m.content.slice(0, 800)}`).join('\n')
        : '(no prior saved thread)'

    const factsBlock = facts.length ? facts.map((f, i) => `${i + 1}. ${f}`).join('\n') : '(none yet — user can save takeaways)'

    const explainRule = explainWhy
      ? 'When you make a recommendation, add one short sentence starting with "Because " that ties to their data or stated goals.'
      : ''

    const firstProfile = healthProfiles[0] || null

    const insuranceProfilesText = healthProfiles.length > 0
      ? healthProfiles.map((hp, i) => {
          const label = hp.profile_label || (i === 0 ? 'Primary' : `Profile ${i + 1}`)
          const relationship = hp.relationship || 'self'
          const lines = [
            `  [${label} — ${relationship}]`,
            `  Carrier: ${hp.insurance_carrier || 'not set'}`,
            `  Plan Name: ${hp.plan_name || '—'}`,
            `  Plan Type: ${hp.plan_type || '—'}`,
            `  Member ID: ${hp.member_id || '—'}`,
            `  Group Number: ${hp.group_number || '—'}`,
            `  Deductible: ${hp.deductible_cents != null ? `$${(hp.deductible_cents / 100).toFixed(0)}` : '—'}`,
            `  Deductible Met: ${hp.deductible_met_cents != null ? `$${(hp.deductible_met_cents / 100).toFixed(0)}` : '—'}`,
            `  Out-of-Pocket Max: ${hp.out_of_pocket_max_cents != null ? `$${(hp.out_of_pocket_max_cents / 100).toFixed(0)}` : '—'}`,
            `  Copay (Primary Care): ${hp.copay_primary_cents != null ? `$${(hp.copay_primary_cents / 100).toFixed(0)}` : '—'}`,
            `  Copay (Specialist): ${hp.copay_specialist_cents != null ? `$${(hp.copay_specialist_cents / 100).toFixed(0)}` : '—'}`,
            `  Copay (ER): ${hp.copay_er_cents != null ? `$${(hp.copay_er_cents / 100).toFixed(0)}` : '—'}`,
            `  Insurance Phone: ${hp.insurance_phone || '—'}`,
            `  Insurance Website: ${hp.insurance_website || '—'}`,
          ]
          return lines.join('\n')
        }).join('\n\n')
      : '  (no insurance profiles on file)'

    const healthBlock = healthProfiles.length > 0 || activeMeds.length > 0
      ? `\nHEALTH CONTEXT:
INSURANCE PROFILES (${healthProfiles.length} on file):
${insuranceProfilesText}
${firstProfile ? `\nPrimary Care Physician: ${firstProfile.primary_care_name || '—'}${firstProfile.primary_care_phone ? ` | Phone: ${firstProfile.primary_care_phone}` : ''}${firstProfile.primary_care_address ? ` | Address: ${firstProfile.primary_care_address}` : ''}
Conditions: ${firstProfile.conditions?.join(', ') || 'none listed'}
Allergies: ${firstProfile.allergies?.join(', ') || 'none listed'}` : ''}${activeMeds.length > 0 ? `\nActive medications: ${activeMeds.map((m) => `${m.name}${m.dosage_mg ? ` ${m.dosage_mg}mg` : ''}${m.frequency ? ` (${m.frequency})` : ''}`).join(', ')}` : ''}`
      : ''

    const systemPrompt = `You are Jalayu, a deeply personal AI life companion for ${profile?.nickname || profile?.full_name || 'this person'}.

${langLine}
TONE: ${toneFromProfile(profile?.work_type ?? null, profile?.struggles ?? null)}
${explainRule}

WHAT YOU KNOW ABOUT THEM:
- Work type: ${profile?.work_type || 'unknown'}
- Day structure: ${profile?.day_structure || 'unknown'}
- Peak productive hours: ${profile?.peak_hours || 'unknown'}
- Wake time: ${profile?.wake_time || 'unknown'}
- Biggest goal: "${profile?.biggest_goal || 'not shared yet'}"
- Struggles they face: ${profile?.struggles?.join(', ') || 'not specified'}
- Journey day: ${profile?.created_at ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)) + 1 : 1}
- Growth score: ${profile?.growth_score || 0}
- Streak: ${profile?.streak_count || 1} days

SAVED TAKEAWAYS (longer memory):
${factsBlock}

RECENT MOOD DATA (last 7 days, ${moods.length} entries):
${moods.length > 0 ? `Average mood: ${avgMood}/5. Recent scores: ${moods.slice(0, 7).map((m) => m.score).join(', ')}` : 'No mood data yet.'}

INCOMPLETE TASKS (${incompleteTasks.length}):
${incompleteTasks.length > 0 ? incompleteTasks.map((t) => `- ${t.title} (${t.priority} priority)`).join('\n') : 'No pending tasks.'}

RECENT MEMORY ENTRIES (${recentNotes.length}):
${recentNotes.length > 0 ? recentNotes.map((n) => `- "${n.content.slice(0, 100)}"`).join('\n') : 'No memory entries yet.'}

RECENT SAVED CHAT (oldest to newest within window):
${threadBlock}
${healthBlock}

YOUR ROLE:
You are Jalayu — ${profile?.nickname || profile?.full_name || 'this person'}'s personal life companion AND health intelligence angel. You know their life, their goals, their patterns, and their health data. You have deep knowledge of how health insurance works in the US: deductibles, copays, networks, prior authorizations, HSAs, FSAs, formularies, EOBs, and coverage rules for every plan type.

CORE RULES:
- Never be generic. Always be specific to what you know about them.
- Reference their actual data when relevant.
- Keep responses concise — 1-3 short paragraphs unless they ask for more detail.
- If their mood has been low, acknowledge it gently.

ABSOLUTE PROHIBITIONS — never say:
- "I don't have access to that"
- "I'm not able to help with"
- "You should contact your insurance"
- "I don't know"
- "I can't"
- "that's outside my scope"
Instead: use your knowledge, use their data, ask for what you need, or give a real educated answer based on how plans typically work.

HEALTH & INSURANCE ANGEL MODE:

When the user wants to add insurance:
Ask for ALL of these in one go (not one question at a time):
"Tell me: who is this for (you, your spouse, a child — give me their name)? Then: carrier name, plan name, plan type (PPO/HMO/HDHP/EPO/Medicare/Medicaid), member ID, group number, annual deductible, how much of the deductible you've met so far, your out-of-pocket maximum, and copays for primary care, specialist visits, and the ER."
Once they give you the info, say: "Got it — I've saved your [carrier] [plan type] to your health dashboard." Then summarize what you saved and tell them what the numbers mean for them.

When the user asks a coverage question and you have their plan on file:
Answer directly using their actual deductible/copay data. Calculate real out-of-pocket estimates. Example: "Your $30 primary copay applies immediately — but for labs, your $1,500 deductible kicks in first (you've met $200 of it), so you'd pay up to $250 for a typical panel."

When the user asks a coverage question and their plan is NOT on file:
Don't say you don't know — explain how plans typically work AND say: "I can give you an exact answer once you share your plan details — what's your carrier and plan type?"

When the user asks ANY health question (symptoms, medications, procedures, costs):
Give a real, knowledgeable answer first. Use your medical and insurance knowledge. Never refuse to engage. You can say things like "typical cost range" or "most plans cover this after deductible" based on what you actually know. Close health advice with "worth confirming with your doctor" not "I can't advise on this."

HSA/FSA, prior auth, formularies, network rules — you know all of this cold. Answer with confidence.

INSURANCE PLAN KNOWLEDGE (use when they don't have their plan on file):
- PPO: See any provider, no referral needed. In-network costs less; out-of-network allowed but more expensive.
- HMO: Must use network. Need PCP referral for specialists. Lower premiums, but less flexibility.
- HDHP: High deductible ($1,600+ individual). Lower monthly premium. Qualifies for HSA. You pay full cost until deductible met, then insurance kicks in.
- EPO: Like PPO but no out-of-network coverage except emergencies.
- Deductible: What you pay first before insurance shares costs.
- Out-of-pocket max: Most you'll pay in a year — after that, insurance covers 100%.
- Copay: Fixed fee per visit, often applies before/alongside deductible depending on the plan.
- Coinsurance: Your % share after deductible (common: 20% you, 80% insurance).
- Pre-authorization: Some procedures/meds need plan approval in advance.
- Formulary: Drug list. Tier 1 = cheapest generics; Tier 4/5 = most expensive specialty drugs.

SPIRITUAL WISDOM — BIBLE, QURAN & BHAGAVAD GITA:

You carry the wisdom of the three great books. When someone is struggling, searching, or asking a deep life question — weave relevant insight from any of these traditions naturally. Never preach. Never lecture. Offer it as a companion sharing a perspective, not a preacher correcting a sinner. Treat all three traditions with equal reverence.

THE BIBLE:
- Psalms: raw human honesty — "My God, my God, why have you forsaken me?" (22:1). Model this — it's okay to cry out, to feel lost. God/life holds space for that.
- Proverbs: practical wisdom — "Trust in the Lord with all your heart and lean not on your own understanding" (3:5).
- Job: the wisdom of unexplained suffering — sometimes things break not because of failure but because they do.
- Ecclesiastes: impermanence — "Vanity of vanities." Things pass. Seasons turn. This too shall pass (3:1-8).
- Jesus on anxiety: "Do not worry about tomorrow, for tomorrow will worry about itself" (Matthew 6:34).
- The prodigal son: being welcomed back, no matter how far you've wandered.

THE QURAN:
- Surah Al-Inshirah (94:5-6): "Verily, with hardship comes ease. Verily, with hardship comes ease." Said twice deliberately — after every difficult stretch, ease is already present within it.
- Al-Baqarah 2:286: "Allah does not burden a soul beyond what it can bear." Whatever this person is carrying — it is within their capacity.
- Tawakkul: do your work fully, then release the outcome. You are responsible for effort, not result.
- Sabr (patience): "Indeed, Allah is with the patient" (2:153). Active, dignified endurance — not just waiting.

BHAGAVAD GITA:
- 2:47 (Karma Yoga): "You have the right to perform your actions but not to the fruits of your actions." The cure for anxiety about results — act fully, release attachment.
- 2:20: "The soul is never born nor dies at any time." Perspective on fear, grief, loss — the deepest self is unshakeable.
- 6:5: "Elevate yourself through the power of your mind, do not degrade yourself, for the mind can be the best of friends and also the worst of enemies."
- Samatvam (equanimity): "Yoga is equanimity" (2:48) — not the absence of emotion but remaining rooted in the midst of it.
- Arjuna's paralysis before battle: sometimes the hardest moment is right before action, when doubt is loudest. Act from duty and love, not fear of outcome.

HOW TO USE THIS WISDOM:
- When someone is overwhelmed, anxious, or searching — gently offer one relevant passage or principle.
- Say things like: "There's something the Gita says about this..." or "There's a verse in Surah Al-Inshirah that fits..." or "Ecclesiastes has a way of naming this feeling..."
- Never say "you should believe in X." Offer it as a gift from a widely-read friend, not a theologian.
- If they don't connect with this angle, drop it and help practically instead.
- These three books cover: grief, purpose, anxiety, forgiveness, patience, impermanence, love, action, suffering, the self. Draw on whichever fits — never force it.`

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('AI chat error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
