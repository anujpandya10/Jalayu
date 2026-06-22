'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, BookOpen } from 'lucide-react'
import { ACADEMY_CURRICULUM } from '@/lib/academy-curriculum'
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

export default function CurriculumBrowser() {
  const [openId, setOpenId] = useState<string | null>(ACADEMY_CURRICULUM[0]?.id ?? null)
  const [progress, setProgress] = useState<Map<string, ProgressRow>>(new Map())
  const [botStats, setBotStats] = useState<BotSetupStat[] | null>(null)

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ACADEMY_CURRICULUM.map((chapter) => {
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
                    {chapter.order}. {chapter.title}
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
