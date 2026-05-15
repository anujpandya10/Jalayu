'use client'

import MoodCard from '@/components/dashboard/MoodCard'
import type { Mood } from '@/lib/types'

export default function WellnessView({
  todayMood,
  moodsRecent,
  onMoodLog,
}: {
  todayMood: Mood | null
  moodsRecent: Mood[]
  onMoodLog: (score: number) => void
}) {
  const sorted = [...moodsRecent].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div style={{ padding: '16px 14px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Wellness</h2>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 12px' }}>
        Jalayu supports your wellbeing — it does not diagnose or treat. If you&apos;re in crisis, contact local emergency services or a licensed professional.
      </p>

      <div style={{ maxWidth: 420, marginBottom: 16 }}>
        <MoodCard todayMood={todayMood} onLog={onMoodLog} />
      </div>

      <div className="card" style={{ padding: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: '0 0 10px' }}>Recent mood entries</p>
        {sorted.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Log a mood above — over time you&apos;ll see rhythm, not noise.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sorted.slice(0, 14).map((m) => (
              <li
                key={m.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', padding: '8px 0',
                  borderBottom: '0.5px solid var(--border)', fontSize: 13, color: 'var(--text)',
                }}
              >
                <span>{new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{m.score}/5</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
