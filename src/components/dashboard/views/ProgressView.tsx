'use client'

import { useMemo } from 'react'
import { Zap, Eye } from 'lucide-react'
import type { Profile, Mood, Task, Insight } from '@/lib/types'

function dayKey(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function ProgressView({
  profile,
  moodsRecent,
  tasksRecent,
  insights = [],
}: {
  profile: Profile | null
  moodsRecent: Mood[]
  tasksRecent: Task[]
  insights?: Insight[]
}) {
  const completedLast14 = useMemo(
    () => tasksRecent.filter((t) => t.completed).length,
    [tasksRecent],
  )

  const moodByDay = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const m of moodsRecent) {
      const k = dayKey(new Date(m.created_at))
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(m.score)
    }
    return map
  }, [moodsRecent])

  const last7 = useMemo(() => {
    const out: { label: string; avg: number | null }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const k = dayKey(d)
      const scores = moodByDay.get(k)
      const avg = scores?.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
      out.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), avg })
    }
    return out
  }, [moodByDay])

  return (
    <div style={{ padding: '16px 14px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Progress</h2>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 16px' }}>Honest signals from what you&apos;ve logged — not judgment, just pattern.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: 14 }}>
          <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 4px' }}>Growth score</p>
          <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--accent)', margin: 0 }}>{profile?.growth_score ?? 0}</p>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '0 0 4px' }}>Streak</p>
          <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{profile?.streak_count ?? 0} days</p>
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: '0 0 10px' }}>Tasks completed (last ~2 weeks)</p>
        <p style={{ fontSize: 22, fontWeight: 600, color: '#22C55E', margin: 0 }}>{completedLast14}</p>
        <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '6px 0 0' }}>Based on tasks created in the last 14 days that you marked done.</p>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: '0 0 12px' }}>Mood (7-day snapshot)</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
          {last7.map(({ label, avg }) => (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 36,
                  margin: '0 auto',
                  borderRadius: 6,
                  background: avg != null ? 'var(--accent)' : 'var(--border)',
                  height: avg != null ? `${(avg / 5) * 100}%` : 8,
                  minHeight: avg != null ? 12 : 8,
                  transition: 'height 0.2s ease',
                }}
                title={avg != null ? `${avg.toFixed(1)}/5` : 'No log'}
              />
              <span style={{ fontSize: 9, color: 'var(--text-2)' }}>{label}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-2)', margin: '12px 0 0' }}>Missing days simply mean no mood was logged.</p>
      </div>

      {/* Compound Effects & Behavioral Patterns from Intelligence */}
      {insights.filter((i) => i.type === 'compound_effect' || i.type === 'behavioral_mirror').length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: '0 0 10px' }}>
            Intelligence Signals
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights
              .filter((i) => i.type === 'compound_effect' || i.type === 'behavioral_mirror')
              .slice(0, 2)
              .map((insight) => (
                <div
                  key={insight.id}
                  className="card"
                  style={{ padding: '12px 14px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    {insight.type === 'compound_effect' ? (
                      <Zap size={12} color="var(--accent)" />
                    ) : (
                      <Eye size={12} color="var(--text-2)" />
                    )}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: insight.type === 'compound_effect' ? 'var(--accent)' : 'var(--text-2)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {insight.type === 'compound_effect' ? 'Compound Effect' : 'Behavioral Pattern'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: '0 0 4px' }}>
                    {insight.title}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
                    {insight.content.includes('|||') ? insight.content.split('|||')[1].trim() : insight.content}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
