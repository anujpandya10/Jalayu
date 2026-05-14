import { BarChart2 } from 'lucide-react'
import { CardHeader } from '@/components/ui/Card'
import { format, subDays } from 'date-fns'
import type { Task, Mood } from '@/lib/types'

interface WeekChartProps {
  tasks: Task[]
  moods: Mood[]
  daysSinceSignup: number
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function getWeekDays() {
  const today = new Date()
  const todayDow = today.getDay() // 0=Sun
  // Build Mon–Sun for current week
  const monday = subDays(today, todayDow === 0 ? 6 : todayDow - 1)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

export default function WeekChart({ tasks, moods, daysSinceSignup }: WeekChartProps) {
  const weekDays = getWeekDays()
  const today = format(new Date(), 'yyyy-MM-dd')

  const completedByDay = weekDays.map((d) => {
    const dayStr = format(d, 'yyyy-MM-dd')
    return tasks.filter((t) => t.completed && t.due_date === dayStr).length
  })

  const moodByDay = weekDays.map((d) => {
    const dayStr = format(d, 'yyyy-MM-dd')
    const dayMoods = moods.filter((m) => m.created_at.startsWith(dayStr))
    if (!dayMoods.length) return 0
    return Math.round(dayMoods.reduce((sum, m) => sum + m.score, 0) / dayMoods.length)
  })

  const maxVal = Math.max(...completedByDay, 1)

  return (
    <div className="card">
      <CardHeader icon={<BarChart2 size={13} />} label="This week so far" />

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 4,
          height: 60,
          marginBottom: 6,
        }}
      >
        {weekDays.map((d, i) => {
          const dayStr = format(d, 'yyyy-MM-dd')
          const isToday = dayStr === today
          const isPast = d < new Date() && !isToday
          const isFuture = d > new Date()
          const val = completedByDay[i]
          const barHeight = isFuture ? 4 : Math.max(val > 0 ? (val / maxVal) * 50 : 6, 4)

          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: barHeight,
                  borderRadius: 3,
                  background: isToday ? '#7F77DD' : isPast ? '#AFA9EC' : '#E5E3FF',
                  opacity: isFuture ? 0.3 : 1,
                  transition: 'height 0.4s ease',
                  alignSelf: 'flex-end',
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  color: isToday ? '#534AB7' : '#9CA3AF',
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {DAY_LABELS[i]}
              </span>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>
        {daysSinceSignup <= 1
          ? "Your journey starts today. By Friday you'll see patterns."
          : `${completedByDay.reduce((a, b) => a + b, 0)} tasks completed this week`}
      </p>
    </div>
  )
}
