import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase-admin'

function verifyCron(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!verifyCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ error: 'Server not configured' }, { status: 503 })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const now = new Date()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  // Get active users (active in last 3 days)
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, nickname, biggest_goal, struggles, peak_hours, growth_score, streak_count, created_at')
    .gte('last_active', threeDaysAgo)
    .limit(500)

  let processed = 0
  for (const profile of profiles || []) {
    // Don't regenerate if we already ran this week (check for weekly_digest from last 6 days)
    const sixDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString()
    const { count: existingCount } = await admin
      .from('insights')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('type', 'weekly_digest')
      .gte('created_at', sixDaysAgo)
    if ((existingCount ?? 0) > 0) continue

    // Fetch all data for this user
    const [moodsRes, tasksRes, notesRes, reflRes, chatRes] = await Promise.all([
      admin.from('moods').select('score, note, time_of_day, created_at').eq('user_id', profile.id).gte('created_at', fourteenDaysAgo).order('created_at', { ascending: true }),
      admin.from('tasks').select('title, completed, completed_at, due_date, priority, created_at').eq('user_id', profile.id).gte('created_at', fourteenDaysAgo).order('created_at', { ascending: true }),
      admin.from('notes').select('content, type, created_at').eq('user_id', profile.id).gte('created_at', fourteenDaysAgo).order('created_at', { ascending: false }).limit(30),
      admin.from('reflections').select('date, one_word, win_of_day, tomorrow_note, mood_score').eq('user_id', profile.id).order('date', { ascending: false }).limit(14),
      admin.from('chat_messages').select('role, content, created_at').eq('user_id', profile.id).gte('created_at', fourteenDaysAgo).order('created_at', { ascending: true }).limit(100),
    ])

    const moods = moodsRes.data || []
    const tasks = tasksRes.data || []
    const notes = notesRes.data || []
    const reflections = reflRes.data || []
    const chats = chatRes.data || []
    const name = profile.nickname || profile.full_name || 'this person'

    // --- Compute raw statistics ---

    // Mood stats
    const moodScores = moods.map(m => m.score)
    const avgMood = moodScores.length ? (moodScores.reduce((a, b) => a + b, 0) / moodScores.length) : null
    const moodVariance = avgMood && moodScores.length > 1
      ? Math.sqrt(moodScores.reduce((sum, s) => sum + Math.pow(s - avgMood, 2), 0) / moodScores.length)
      : null

    // This week vs last week moods
    const thisWeekMoods = moods.filter(m => m.created_at >= sevenDaysAgo).map(m => m.score)
    const lastWeekMoods = moods.filter(m => m.created_at < sevenDaysAgo).map(m => m.score)
    const thisWeekAvg = thisWeekMoods.length ? thisWeekMoods.reduce((a, b) => a + b, 0) / thisWeekMoods.length : null
    const lastWeekAvg = lastWeekMoods.length ? lastWeekMoods.reduce((a, b) => a + b, 0) / lastWeekMoods.length : null
    const moodTrend = thisWeekAvg && lastWeekAvg ? thisWeekAvg - lastWeekAvg : null

    // Task stats
    const completedTasks = tasks.filter(t => t.completed)
    const incompleteTasks = tasks.filter(t => !t.completed)
    const completionRate = tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0
    const thisWeekTasks = tasks.filter(t => t.created_at >= sevenDaysAgo)
    const lastWeekTasks = tasks.filter(t => t.created_at < sevenDaysAgo)
    const thisWeekCompleted = thisWeekTasks.filter(t => t.completed).length
    const lastWeekCompleted = lastWeekTasks.filter(t => t.completed).length

    // Consecutive low mood days (energy debt signal)
    const moodByDay: Record<string, number> = {}
    for (const m of moods) {
      const day = m.created_at.split('T')[0]
      moodByDay[day] = m.score
    }
    let consecutiveLowDays = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
      if (moodByDay[d] && moodByDay[d] <= 2) consecutiveLowDays++
      else if (moodByDay[d]) break
    }

    // Goal mention tracking
    const goal = profile.biggest_goal || ''
    const goalKeyword = goal.split(' ').slice(0, 3).join(' ').toLowerCase()
    const userMessages = chats.filter(c => c.role === 'user').map(c => c.content.toLowerCase())
    const goalMentionDays = new Set(
      chats
        .filter(c => c.role === 'user' && goalKeyword && c.content.toLowerCase().includes(goalKeyword.split(' ')[0]))
        .map(c => c.created_at.split('T')[0])
    ).size
    const daysSinceGoalMention = (() => {
      const lastMention = chats
        .filter(c => c.role === 'user' && goalKeyword && c.content.toLowerCase().includes(goalKeyword.split(' ')[0]))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      if (!lastMention) return null
      const diffMs = now.getTime() - new Date(lastMention.created_at).getTime()
      return Math.floor(diffMs / 86400000)
    })()

    // People/relationship mentions
    const peopleMentions: Record<string, number> = {}
    for (const msg of userMessages) {
      // Extract capitalized names (simple heuristic)
      const words = msg.split(/\s+/)
      for (const word of words) {
        const clean = word.replace(/[^a-zA-Z]/g, '')
        if (clean.length > 2 && clean[0] === clean[0].toUpperCase() && clean[0] !== clean[0].toLowerCase()) {
          // Skip common words
          const skip = ['I', 'The', 'A', 'An', 'But', 'And', 'Or', 'So', 'My', 'Your', 'We', 'They', 'Today', 'This', 'That', 'Just', 'Really', 'Also', 'If', 'When', 'What', 'How', 'Its', "It's", "I'm", "I've", "I'll", "Don't", "Can't", "Won't"]
          if (!skip.includes(clean)) {
            peopleMentions[clean] = (peopleMentions[clean] || 0) + 1
          }
        }
      }
    }
    const topPeople = Object.entries(peopleMentions)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([personName]) => personName)

    // Emotional vocabulary diversity
    const emotionWords = userMessages.join(' ').match(/\b(happy|sad|anxious|excited|tired|frustrated|calm|overwhelmed|motivated|stuck|great|terrible|okay|good|bad|worried|confident|uncertain|peaceful|stressed|grateful|empty|full|alive|numb|hopeful|hopeless|energized|drained|clear|confused|proud|ashamed|loved|alone|connected|isolated)\b/gi) || []
    const uniqueEmotionWords = new Set(emotionWords.map(w => w.toLowerCase())).size

    // Focus score computation
    const reflectionDays = reflections.filter(r => {
      const d = new Date(r.date)
      return d >= new Date(Date.now() - 7 * 86400000)
    }).length
    const focusScore = Math.round(
      (completionRate * 0.30) +
      (Math.min(thisWeekMoods.length, 7) / 7 * 100 * 0.25) +
      (Math.min(reflectionDays, 7) / 7 * 100 * 0.20) +
      (Math.min(goalMentionDays, 7) / 7 * 100 * 0.15) +
      (Math.min(notes.filter(n => n.created_at >= sevenDaysAgo).length, 7) / 7 * 100 * 0.10)
    )

    // Decisions from notes
    const decisions = notes.filter(n => n.type === 'decision').slice(0, 5)

    // --- Generate all insights with a single comprehensive Claude call ---
    const dataPackage = `
NAME: ${name}
GOAL: "${goal || 'not set'}"
STRUGGLES: ${(profile.struggles || []).join(', ') || 'none specified'}
DAY OF JOURNEY: ${Math.floor((now.getTime() - new Date(profile.created_at).getTime()) / 86400000) + 1}

MOOD DATA (14 days):
- Total entries: ${moods.length}
- Average: ${avgMood ? avgMood.toFixed(1) : 'N/A'}/5
- Variance: ${moodVariance ? moodVariance.toFixed(2) : 'N/A'} (lower = more stable)
- This week avg: ${thisWeekAvg ? thisWeekAvg.toFixed(1) : 'N/A'}/5 vs last week: ${lastWeekAvg ? lastWeekAvg.toFixed(1) : 'N/A'}/5 (trend: ${moodTrend ? (moodTrend > 0 ? '+' : '') + moodTrend.toFixed(1) : 'insufficient data'})
- Consecutive low days (≤2): ${consecutiveLowDays}
- Daily breakdown: ${Object.entries(moodByDay).slice(-7).map(([d, s]) => `${d.slice(5)}: ${s}/5`).join(', ')}

TASK DATA (14 days):
- Created: ${tasks.length}, Completed: ${completedTasks.length}, Completion rate: ${completionRate}%
- This week: ${thisWeekCompleted}/${thisWeekTasks.length} completed vs last week: ${lastWeekCompleted}/${lastWeekTasks.length}
- Recurring uncompleted: ${incompleteTasks.slice(0, 5).map(t => `"${t.title}"`).join(', ')}

FOCUS SCORE: ${focusScore}/100

ENERGY DEBT SIGNAL: ${consecutiveLowDays >= 3 ? 'HIGH — ' + consecutiveLowDays + ' consecutive low-mood days' : consecutiveLowDays >= 1 ? 'MODERATE' : 'LOW'}

GOAL ENGAGEMENT:
- Days goal mentioned in chat: ${goalMentionDays} of last 14
- Days since last goal mention: ${daysSinceGoalMention !== null ? daysSinceGoalMention : 'never mentioned'}

EMOTIONAL VOCABULARY: ${uniqueEmotionWords} distinct emotion words used (higher = more self-aware expression)

PEOPLE MENTIONED (≥2x): ${topPeople.join(', ') || 'none identified'}

REFLECTIONS: ${reflections.length} entries in 14 days. Words used: ${reflections.map(r => r.one_word).filter(Boolean).join(', ') || 'none'}

RECENT DECISIONS TRACKED: ${decisions.map(d => `"${d.content.slice(0, 80)}"`).join(' | ') || 'none'}

RECENT CHAT TOPICS (user messages, last 14 days): ${userMessages.slice(-20).map(m => m.slice(0, 100)).join(' | ')}
`.trim()

    const claudePrompt = `You are Jalayu's intelligence engine. Analyze ${name}'s last 14 days of data and generate 8 specific, honest intelligence reports. Use ONLY the data provided — no assumptions.

DATA:
${dataPackage}

Generate exactly this JSON (no markdown, valid JSON only):
{
  "behavioral_mirror": "2-3 sentences: the single most important behavioral pattern visible in this data. Be specific with numbers. This should feel like someone has been watching quietly and noticed something true.",
  "silence_observer": "1-2 sentences about something important that's gone quiet — a goal not mentioned, a pattern of avoidance, or a gap between stated priorities and actual behavior. If nothing concerning, say what's actually present.",
  "life_changelog": "2 sentences comparing this week to last week. What measurably changed? Use the numbers.",
  "compound_effect": "1-2 sentences about the highest-correlation pattern found: when X happens, Y follows. Use actual data points.",
  "energy_debt": "1-2 sentences assessing burnout risk. Reference the consecutive low days and task abandonment if present. Be honest without being alarming.",
  "goal_momentum": "1-2 sentences on velocity toward their stated goal. Are they moving toward it or away from it? What does the data say?",
  "relationship_health": "1-2 sentences about the people showing up in their conversation. Any patterns worth noting?",
  "weekly_council": "3 sentences: one from a performance coach perspective, one from a therapist perspective, one from a close friend. Each starts with the role in brackets: [Coach], [Therapist], [Friend].",
  "focus_score_explanation": "1 sentence explaining what drove their ${focusScore}/100 focus score this week — what pulled it up or down.",
  "emotional_vocabulary": "1 sentence on the ${uniqueEmotionWords} distinct emotion words used — what does this suggest about their self-awareness this week?"
}`

    let intelligenceData: Record<string, string> = {}
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: claudePrompt }],
      })
      const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
      // Parse JSON, strip any markdown fences
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      intelligenceData = JSON.parse(cleaned)
    } catch {
      // If Claude fails or returns invalid JSON, store empty
      intelligenceData = {}
    }

    // Store all insights
    const insightRows = [
      { type: 'behavioral_mirror', title: 'Behavioral Mirror', content: intelligenceData.behavioral_mirror || '', priority: 'high' },
      { type: 'silence_observer', title: 'Silence Observer', content: intelligenceData.silence_observer || '', priority: 'medium' },
      { type: 'life_changelog', title: 'Life Changelog', content: intelligenceData.life_changelog || '', priority: 'medium' },
      { type: 'compound_effect', title: 'Compound Effect', content: intelligenceData.compound_effect || '', priority: 'medium' },
      { type: 'energy_debt', title: 'Energy Signals', content: intelligenceData.energy_debt || '', priority: consecutiveLowDays >= 3 ? 'high' : 'low' },
      { type: 'goal_momentum', title: 'Goal Momentum', content: intelligenceData.goal_momentum || '', priority: 'high' },
      { type: 'relationship_health', title: 'Relationship Health', content: intelligenceData.relationship_health || '', priority: 'low' },
      { type: 'weekly_digest', title: 'Weekly Council', content: intelligenceData.weekly_council || '', priority: 'high' },
      { type: 'focus_score', title: `Focus Score: ${focusScore}/100`, content: `${focusScore}|||${intelligenceData.focus_score_explanation || ''}`, priority: 'medium' },
      { type: 'emotional_vocabulary', title: 'Emotional Vocabulary', content: `${uniqueEmotionWords}|||${intelligenceData.emotional_vocabulary || ''}`, priority: 'low' },
    ].filter(r => r.content && r.content.trim())

    for (const row of insightRows) {
      await admin.from('insights').insert({
        user_id: profile.id,
        ...row,
        is_read: false,
      })
    }

    processed++
  }

  return NextResponse.json({ ok: true, processed })
}
