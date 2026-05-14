'use client'

import type { Profile, Task } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import TasksPanel from './TasksPanel'

export default function MyDayView({
  profile,
  tasks,
  onAddTask,
  onToggleTask,
}: {
  profile: Profile | null
  tasks: Task[]
  onAddTask: (title: string) => Promise<void>
  onToggleTask: (task: Task) => Promise<void>
}) {
  const peak = profile?.peak_hours || 'your sharpest hours'
  const wake = profile?.wake_time || 'when you wake'

  return (
    <div>
      <div
        style={{
          margin: '12px 14px 0',
          padding: '14px 16px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, #EEEDFE 0%, #fff 100%)',
          border: '0.5px solid #E5E3FF',
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 500, color: '#534AB7', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
          My day
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: '0 0 6px' }}>{formatDate()}</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
          You said you&apos;re sharpest in the <strong style={{ color: '#26215C' }}>{peak}</strong> and usually up around{' '}
          <strong style={{ color: '#26215C' }}>{wake}</strong>. When you can, protect one deep block there — calendar sync is coming next.
        </p>
      </div>
      <TasksPanel
        tasks={tasks}
        profile={profile}
        onAdd={onAddTask}
        onToggle={onToggleTask}
        title="Today"
        subtitle="Tasks due today"
      />
    </div>
  )
}
