'use client'

import MoodCard from '@/components/dashboard/MoodCard'
import TasksCard from '@/components/dashboard/TasksCard'
import GoalCard from '@/components/dashboard/GoalCard'
import PeakHoursCard from '@/components/dashboard/PeakHoursCard'
import WeekChart from '@/components/dashboard/WeekChart'
import InsightCard from '@/components/dashboard/InsightCard'
import KnowledgeCard from '@/components/dashboard/KnowledgeCard'
import SetupChecklist from '@/components/dashboard/SetupChecklist'
import PatternCard from '@/components/dashboard/PatternCard'
import type { Profile, Task, Mood, Note } from '@/lib/types'

export default function HomeContent({
  journeyView,
  profile,
  tasks,
  todayMood,
  notes,
  daysSinceSignup,
  onMoodLog,
  onAddTask,
  onToggleTask,
}: {
  journeyView: string
  profile: Profile | null
  tasks: Task[]
  todayMood: Mood | null
  notes: Note[]
  daysSinceSignup: number
  onMoodLog: (score: number) => void
  onAddTask: (title: string) => Promise<void>
  onToggleTask: (task: Task) => Promise<void>
}) {
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    padding: '12px 14px',
  }

  if (journeyView === 'day1') {
    return (
      <div style={gridStyle}>
        <div style={{ gridColumn: 'span 2' }}>
          <SetupChecklist profile={profile} notes={notes} />
        </div>
        <MoodCard todayMood={todayMood} onLog={onMoodLog} />
        <GoalCard goal={profile?.biggest_goal} />
      </div>
    )
  }

  if (journeyView === 'day2') {
    return (
      <div style={gridStyle}>
        <div style={{ gridColumn: 'span 2' }}>
          <MoodCard todayMood={todayMood} onLog={onMoodLog} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <TasksCard tasks={tasks} profile={profile} onAdd={onAddTask} onToggle={onToggleTask} />
        </div>
        <PeakHoursCard peakHours={profile?.peak_hours} wakeTime={profile?.wake_time} />
        <GoalCard goal={profile?.biggest_goal} />
      </div>
    )
  }

  if (journeyView === 'day7') {
    return (
      <div style={gridStyle}>
        <MoodCard todayMood={todayMood} onLog={onMoodLog} />
        <PeakHoursCard peakHours={profile?.peak_hours} wakeTime={profile?.wake_time} />
        <div style={{ gridColumn: 'span 2' }}>
          <TasksCard tasks={tasks} profile={profile} onAdd={onAddTask} onToggle={onToggleTask} />
        </div>
        <WeekChart tasks={tasks} moods={[]} daysSinceSignup={daysSinceSignup} />
        <KnowledgeCard
          daysSinceSignup={daysSinceSignup}
          hasWorkType={!!profile?.work_type}
          hasPeakHours={!!profile?.peak_hours}
          moodsCount={todayMood ? 7 : 0}
          tasksCount={tasks.length}
        />
        <div style={{ gridColumn: 'span 2' }}>
          <InsightCard profile={profile} daysSinceSignup={daysSinceSignup} />
        </div>
      </div>
    )
  }

  return (
    <div style={gridStyle}>
      <MoodCard todayMood={todayMood} onLog={onMoodLog} />
      <PeakHoursCard peakHours={profile?.peak_hours} wakeTime={profile?.wake_time} />
      <div style={{ gridColumn: 'span 2' }}>
        <TasksCard tasks={tasks} profile={profile} onAdd={onAddTask} onToggle={onToggleTask} />
      </div>
      <WeekChart tasks={tasks} moods={[]} daysSinceSignup={daysSinceSignup} />
      <InsightCard profile={profile} daysSinceSignup={daysSinceSignup} />
      <PatternCard tasks={tasks} moods={[]} daysSinceSignup={daysSinceSignup} />
    </div>
  )
}
