'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Task, Reminder, HealthAppointment } from '@/lib/types'
import {
  buildScheduleItems,
  formatScheduleTime,
  scheduleItemIcon,
  SCHEDULE_COLORS,
  toLocalDateStr,
  type GoogleCalEvent,
} from '@/lib/schedule'

const PREVIEW_COUNT = 2

export default function ScheduleCompact({
  tasks,
  reminders,
  healthAppointments = [],
  onAddTask,
  onToggleTask,
  onOpenFullCalendar,
}: {
  tasks: Task[]
  reminders: Reminder[]
  healthAppointments?: HealthAppointment[]
  onAddTask: (title: string, date?: string, eventType?: string) => Promise<void>
  onToggleTask: (task: Task) => Promise<void>
  onOpenFullCalendar: () => void
}) {
  const todayStr = toLocalDateStr(new Date())
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const [googleEvents, setGoogleEvents] = useState<GoogleCalEvent[]>([])
  const [calConnected, setCalConnected] = useState<boolean | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [listExpanded, setListExpanded] = useState(false)
  const [cardCollapsed, setCardCollapsed] = useState(false)

  useEffect(() => {
    fetch('/api/calendar/events')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) { setCalConnected(false); return }
        setCalConnected(data.connected ?? false)
        setGoogleEvents(data.events ?? [])
      })
      .catch(() => setCalConnected(false))
  }, [])

  const todayItems = useMemo(
    () => buildScheduleItems(tasks, reminders, googleEvents, todayStr, todayStr, healthAppointments),
    [tasks, reminders, googleEvents, healthAppointments, todayStr],
  )

  const visibleItems = listExpanded ? todayItems : todayItems.slice(0, PREVIEW_COUNT)
  const hasMore = todayItems.length > PREVIEW_COUNT

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      await onAddTask(title.trim(), todayStr, 'task')
      setTitle('')
      setShowAdd(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: cardCollapsed ? 0 : 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          {todayItems.length > 0 && (
            <button
              type="button"
              onClick={() => setCardCollapsed(!cardCollapsed)}
              aria-label={cardCollapsed ? 'Expand calendar' : 'Collapse calendar'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, marginTop: 2, color: 'var(--text-3)', display: 'flex' }}
            >
              {cardCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          )}
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>Calendar</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>{todayLabel}</p>
            {cardCollapsed && todayItems.length > 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' }}>
                {todayItems.length} item{todayItems.length !== 1 ? 's' : ''} today
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenFullCalendar}
          style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
        >
          full calendar →
        </button>
      </div>

      {!cardCollapsed && (
        <>
          {calConnected === false && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px' }}>
              <a href="/api/calendar/google/start" style={{ color: 'var(--accent)' }}>Connect Google Calendar</a> to sync events
            </p>
          )}

          {todayItems.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px' }}>Nothing on the schedule today — you&apos;re clear ✓</p>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: hasMore ? 4 : 10 }}>
                {visibleItems.map((ev) => {
                  const color = SCHEDULE_COLORS[ev.type]
                  const isTask = ev.source === 'task'
                  const task = isTask ? (ev.raw as Task) : null
                  const timeLabel = formatScheduleTime(ev.sortMin)
                  return (
                    <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: ev.completed ? 0.55 : 1 }}>
                      {isTask && task ? (
                        <button
                          type="button"
                          onClick={() => onToggleTask(task)}
                          style={{
                            width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                            border: `1.5px solid ${color}`, background: ev.completed ? color : 'transparent', cursor: 'pointer',
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 12, flexShrink: 0 }}>{scheduleItemIcon(ev.type)}</span>
                      )}
                      <span style={{
                        fontSize: 12, color: 'var(--text)', flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textDecoration: ev.completed ? 'line-through' : 'none',
                      }}>
                        {ev.title}
                      </span>
                      {timeLabel && <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{timeLabel}</span>}
                    </div>
                  )
                })}
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setListExpanded(!listExpanded)}
                  style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '0 0 10px', width: '100%', textAlign: 'left',
                  }}
                >
                  {listExpanded ? 'Show less' : `View more (${todayItems.length - PREVIEW_COUNT})`}
                </button>
              )}
            </>
          )}

          {showAdd ? (
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task, reminder, or event…"
                autoFocus
                style={{ flex: 1, fontSize: 12, border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', fontFamily: 'inherit', borderBottom: '1px solid var(--border-2)', paddingBottom: 4 }}
              />
              <button type="submit" disabled={submitting || !title.trim()} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {submitting ? '…' : 'Add'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span style={{ fontSize: 14, lineHeight: 1, color: 'var(--accent)' }}>+</span> add to today
            </button>
          )}
        </>
      )}
    </div>
  )
}
