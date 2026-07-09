'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown, ChevronRight, BookOpen, Check, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { ACADEMY_CURRICULUM, type CurriculumChapter, getChapter } from '@/lib/academy-curriculum'
import { EXPERIENCE_LEVELS, LEVEL_CHAPTER_SEQUENCE, type ExperienceLevel } from '@/lib/academy-levels'
import { useStore } from '@/store/useStore'
import type { Profile } from '@/lib/types'
import ChapterScenarioCheck from './ChapterScenarioCheck'
import SetupStatsBadge from './SetupStatsBadge'

interface ProgressRow {
  chapter_id: string
  completed: boolean
  scenario_correct: boolean | null
}

interface BotSetupStat {
  setupTag: string
  totalTrades: number
  winRatePct: number
  avgPnl: number
}

/** Level-ordered if the user has a stated level, else the curriculum's own authored order —
 * defensive against a stale level-sequence id that no longer exists in ACADEMY_CURRICULUM. */
function orderedChapters(level: ExperienceLevel | null | undefined): CurriculumChapter[] {
  if (!level) return ACADEMY_CURRICULUM
  const seq = LEVEL_CHAPTER_SEQUENCE[level]
  const ordered = seq.map((id) => getChapter(id)).filter((c): c is CurriculumChapter => c != null)
  return ordered.length > 0 ? ordered : ACADEMY_CURRICULUM
}

export default function CurriculumBrowser() {
  const { profile, setProfile } = useStore()
  const level = (profile?.academy_experience_level ?? null) as ExperienceLevel | null
  const chapters = useMemo(() => orderedChapters(level), [level])

  const [openId, setOpenId] = useState<string | null>(chapters[0]?.id ?? null)
  const [progress, setProgress] = useState<Map<string, ProgressRow>>(new Map())
  const [botStats, setBotStats] = useState<BotSetupStat[] | null>(null)
  const [savingLevel, setSavingLevel] = useState(false)
  const [skippedLevelPrompt, setSkippedLevelPrompt] = useState(false)
  const [showLevelPicker, setShowLevelPicker] = useState(false)

  const chooseLevel = async (id: ExperienceLevel) => {
    setSavingLevel(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academy_experience_level: id }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not save'); return }
      if (json.profile) setProfile(json.profile as Profile)
      toast.success('Curriculum reordered for you')
    } finally {
      setSavingLevel(false)
    }
  }

  const loadProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/academy/progress', { cache: 'no-store' })
      if (!res.ok) return
      const rows = await res.json() as ProgressRow[]
      setProgress(new Map(rows.map((r) => [r.chapter_id, r])))
    } catch {
      // non-critical — chapters still render without saved progress
    }
  }, [])

  useEffect(() => {
    void loadProgress()
    void (async () => {
      try {
        const res = await fetch('/api/academy/stats', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json() as { botSetupStats: BotSetupStat[] }
          setBotStats(data.botSetupStats)
        }
      } catch {
        // badges just show "no real trades yet" if this fails
      }
    })()
  }, [loadProgress])

  const completedCount = [...progress.values()].filter((p) => p.completed).length

  const handleAnswered = async (chapterId: string, correct: boolean) => {
    setProgress((prev) => {
      const next = new Map(prev)
      next.set(chapterId, { chapter_id: chapterId, completed: true, scenario_correct: correct })
      return next
    })
    try {
      await fetch('/api/academy/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, completed: true, scenarioCorrect: correct }),
      })
    } catch {
      // local state already updated — a failed sync just means it won't persist across devices
    }
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
      }}>
        <BookOpen size={15} color="var(--accent)" />
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          The curriculum
        </h2>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 14px' }}>
        {completedCount} of {ACADEMY_CURRICULUM.length} chapters checked off. Each one ties a real trader's
        strategy to a setup your own engine actually trades — open a chapter, then try the practice desk
        with that setup in mind.
      </p>

      {level && !showLevelPicker ? (
        <button type="button" onClick={() => setShowLevelPicker(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, marginBottom: 14, fontSize: 11.5, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit' }}>
          Learning path: <strong style={{ color: 'var(--text-2)' }}>{EXPERIENCE_LEVELS.find((o) => o.id === level)?.label}</strong> · change
        </button>
      ) : (!level && skippedLevelPrompt) ? null : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--morning)', padding: 14, marginBottom: 14 }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', margin: '0 0 10px' }}>
            Where are you starting from? I&apos;ll order the chapters to match.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {EXPERIENCE_LEVELS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={savingLevel}
                onClick={() => { void chooseLevel(opt.id); setShowLevelPicker(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  padding: '9px 11px', borderRadius: 9, cursor: savingLevel ? 'wait' : 'pointer', fontFamily: 'inherit',
                  background: opt.id === level ? 'var(--surface)' : 'var(--surface)',
                  border: `1px solid ${opt.id === level ? 'var(--accent)' : 'var(--border)'}`, width: '100%',
                }}
              >
                {opt.id === level ? <Check size={13} color="var(--accent)" /> : savingLevel ? <Loader2 size={13} className="animate-spin" color="var(--text-3)" /> : <span style={{ width: 13 }} />}
                <span>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{opt.blurb}</div>
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setSkippedLevelPrompt(true); setShowLevelPicker(false) }}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
            {level ? 'Close' : 'Skip — use the default order'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {chapters.map((chapter, i) => {
          const isOpen = openId === chapter.id
          const prog = progress.get(chapter.id)
          return (
            <div key={chapter.id} style={{
              border: '1px solid var(--border)', borderRadius: 12,
              background: 'var(--surface)', overflow: 'hidden',
            }}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : chapter.id)}
                style={{
                  width: '100%', padding: '12px 14px', textAlign: 'left',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit',
                }}
              >
                {isOpen ? <ChevronDown size={14} color="var(--text-3)" /> : <ChevronRight size={14} color="var(--text-3)" />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {i + 1}. {chapter.title}
                    {prog?.completed && (
                      <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, color: prog.scenario_correct ? '#16A34A' : 'var(--text-3)' }}>
                        ✓
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {chapter.trader} — {chapter.coreIdea}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: '0 14px 16px' }}>
                  <div style={{
                    padding: 10, marginBottom: 10, borderRadius: 8,
                    background: 'var(--morning)', fontSize: 11.5, color: 'var(--text-2)',
                    fontStyle: 'italic', lineHeight: 1.55,
                  }}>
                    {chapter.visualDescription}
                  </div>

                  {chapter.body.map((para, i) => (
                    <p key={i} style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.65, margin: '0 0 10px' }}>
                      {para}
                    </p>
                  ))}

                  {chapter.mappedSetupTags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, marginBottom: 4 }}>
                      {chapter.mappedSetupTags.map((tag) => (
                        <SetupStatsBadge key={tag} setupTag={tag} stats={botStats} />
                      ))}
                    </div>
                  )}

                  <ChapterScenarioCheck
                    check={chapter.scenarioCheck}
                    alreadyCorrect={prog?.scenario_correct ?? null}
                    onAnswered={(correct) => void handleAnswered(chapter.id, correct)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
