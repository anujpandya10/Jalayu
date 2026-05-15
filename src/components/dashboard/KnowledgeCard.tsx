import { Brain } from 'lucide-react'
import { CardHeader } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'

interface KnowledgeCardProps {
  daysSinceSignup: number
  hasWorkType: boolean
  hasPeakHours: boolean
  moodsCount: number
  tasksCount: number
}

export default function KnowledgeCard({
  daysSinceSignup,
  hasWorkType,
  hasPeakHours,
  moodsCount,
  tasksCount,
}: KnowledgeCardProps) {
  const moodPct = Math.min(100, Math.round((moodsCount / 21) * 100)) // 21 = 3 weeks daily
  const habitPct = Math.min(100, Math.round((tasksCount / 30) * 100)) // 30 tasks = full

  return (
    <div className="card">
      <CardHeader icon={<Brain size={13} />} label="What I know about you" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ProgressBar
          label="Work type"
          value={hasWorkType ? 100 : 0}
          valueLabel={hasWorkType ? '100%' : '0%'}
        />
        <ProgressBar
          label="Day rhythm"
          value={hasPeakHours ? 100 : 0}
          valueLabel={hasPeakHours ? '100%' : '0%'}
        />
        <ProgressBar
          label="Mood patterns"
          value={moodPct}
          valueLabel={`${moodPct}%`}
        />
        <ProgressBar
          label="Work habits"
          value={habitPct}
          valueLabel={`${habitPct}%`}
        />
      </div>

      <p style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 10, marginBottom: 0 }}>
        The more you use this, the smarter it gets.
      </p>
    </div>
  )
}
