'use client'

import { useEffect, useState } from 'react'
import type { Profile, Task } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import TasksPanel from './TasksPanel'

type CalEvent = { title: string; start: string | null }

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
  const [events, setEvents] = useState<CalEvent[]>([])
  const [calConnected, setCalConnected] = useState<boolean | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [st, ev] = await Promise.all([
          fetch('/api/calendar/status').then((r) => r.json()),
          fetch('/api/calendar/events').then((r) => r.json()),
        ])
        setCalConnected(!!st.connected)
        if (ev.events) setEvents(ev.events)
      } catch {
        setCalConnected(false)
      }
    })()
  }, [])

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
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px', lineHeight: 1.5 }}>
          You said you&apos;re sharpest in the <strong style={{ color: '#26215C' }}>{peak}</strong> and usually up around{' '}
          <strong style={{ color: '#26215C' }}>{wake}</strong>. Protect one deep block when you can.
        </p>
        {calConnected === false && (
          <a
            href="/api/calendar/google/start"
            style={{ fontSize: 12, fontWeight: 500, color: '#534AB7' }}
          >
            Connect Google Calendar (read-only)
          </a>
        )}
        {calConnected && events.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid #E5E3FF' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#534AB7', margin: '0 0 6px' }}>Up next</p>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#374151' }}>
              {events.slice(0, 5).map((e) => (
                <li key={`${e.title}-${e.start}`} style={{ marginBottom: 4 }}>
                  {e.title}
                  {e.start ? ` · ${new Date(e.start).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
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
