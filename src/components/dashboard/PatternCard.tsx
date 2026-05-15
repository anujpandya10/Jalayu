import { Sparkles } from 'lucide-react'
import { CardHeader } from '@/components/ui/Card'
import type { Task, Mood } from '@/lib/types'

interface PatternCardProps {
  tasks: Task[]
  moods: Mood[]
  daysSinceSignup: number
}

interface Pattern {
  dot: string
  bold: string
  detail: string
}

function generatePatterns(tasks: Task[], moods: Mood[], days: number): Pattern[] {
  const completedTasks = tasks.filter((t) => t.completed)
  const completionRate = tasks.length
    ? Math.round((completedTasks.length / tasks.length) * 100)
    : 0

  const avgMood =
    moods.length
      ? Math.round(moods.reduce((s, m) => s + m.score, 0) / moods.length * 10) / 10
      : null

  const patterns: Pattern[] = [
    {
      dot: 'var(--accent)',
      bold: `${completionRate}% task completion rate`,
      detail: completionRate >= 70
        ? "You're consistently getting things done. This is a strong foundation."
        : 'Room to grow here. Even small adjustments to your morning routine can shift this.',
    },
    {
      dot: avgMood && avgMood >= 3.5 ? '#22C55E' : '#F59E0B',
      bold: avgMood ? `Average mood: ${avgMood}/5` : 'Mood tracking started',
      detail: avgMood
        ? avgMood >= 3.5
          ? 'Your baseline is positive. Keep logging — peaks and valleys will emerge soon.'
          : 'Some hard days in there. Logging consistently helps you prepare, not just react.'
        : 'Log your mood daily to start finding your patterns.',
    },
    {
      dot: '#3B82F6',
      bold: `${days} days of consistent logging`,
      detail: days >= 7
        ? 'A full week of data. Jalayu is now starting to see real patterns in your behavior.'
        : 'Keep going. 7 days is the threshold where patterns start to emerge.',
    },
    {
      dot: '#EF4444',
      bold: 'Peak window accuracy',
      detail: "We'll refine your peak hours estimate over the next few weeks based on when you actually get things done.",
    },
  ]

  return patterns
}

export default function PatternCard({ tasks, moods, daysSinceSignup }: PatternCardProps) {
  const patterns = generatePatterns(tasks, moods, daysSinceSignup)

  return (
    <div className="card" style={{ gridColumn: 'span 2' }}>
      <CardHeader
        icon={<Sparkles size={13} />}
        label={`Patterns we found ${daysSinceSignup >= 30 ? 'in 30 days' : 'this week'}`}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        {patterns.map((p, i) => (
          <div
            key={i}
            style={{
              background: 'var(--surface-2)',
              borderRadius: 8,
              padding: '9px 11px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: p.dot,
                marginTop: 3,
                flexShrink: 0,
              }}
            />
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', margin: '0 0 2px' }}>
                {p.bold}
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                {p.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
