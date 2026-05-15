'use client'

import { useState, useMemo } from 'react'
import type { Task, Reminder } from '@/lib/types'

interface UnifiedCalendarViewProps {
  tasks: Task[]
  reminders: Reminder[]
  onAddTask: (title: string, date?: string, eventType?: string) => Promise<void>
  onToggleTask: (task: Task) => Promise<void>
}

type EventType = 'task' | 'reminder' | 'event' | 'birthday' | 'meeting'

const EVENT_COLORS: Record<EventType, string> = {
  task: 'var(--accent)',
  reminder: '#92400E',
  event: '#4B5563',
  birthday: '#15803D',
  meeting: '#1D4ED8',
}

const EVENT_TYPE_OPTIONS: { id: EventType; label: string }[] = [
  { id: 'task', label: 'Task' },
  { id: 'reminder', label: 'Reminder' },
  { id: 'event', label: 'Event' },
  { id: 'birthday', label: 'Birthday' },
  { id: 'meeting', label: 'Meeting' },
]

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toLocalDate(dateStr: string): Date {
  // Parse YYYY-MM-DD without timezone shift
  const [y, m, day] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, day)
}

// Extract date portion from a datetime string
function getDatePart(str: string | null | undefined): string | null {
  if (!str) return null
  // Could be "2026-05-15" or "2026-05-15T10:00:00"
  return str.slice(0, 10)
}

// Get sort time (minutes from midnight) from Task due_time or Reminder remind_at
function getSortMinutes(item: Task | Reminder): number {
  if ('due_time' in item && item.due_time) {
    const [h, m] = item.due_time.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  if ('remind_at' in item) {
    try {
      const d = new Date(item.remind_at)
      return d.getHours() * 60 + d.getMinutes()
    } catch {
      return 1440
    }
  }
  return 1440
}

function getEventType(item: Task | Reminder): EventType {
  if ('event_type' in item && item.event_type) {
    return item.event_type as EventType
  }
  if ('remind_at' in item) return 'reminder'
  return 'task'
}

function getEventIcon(type: EventType): string {
  if (type === 'reminder') return '🔔'
  if (type === 'birthday') return '🎂'
  if (type === 'meeting') return '💼'
  if (type === 'event') return '📅'
  return '' // tasks use circle
}

export default function UnifiedCalendarView({
  tasks,
  reminders,
  onAddTask,
  onToggleTask,
}: UnifiedCalendarViewProps) {
  const today = new Date()
  const todayStr = toLocalDateStr(today)

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addEventType, setAddEventType] = useState<EventType>('task')
  const [addTime, setAddTime] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Build dates map: dateStr -> has events
  const eventDateSet = useMemo(() => {
    const set = new Set<string>()
    for (const t of tasks) {
      if (t.due_date) set.add(getDatePart(t.due_date)!)
    }
    for (const r of reminders) {
      const dp = getDatePart(r.remind_at)
      if (dp) set.add(dp)
    }
    return set
  }, [tasks, reminders])

  // Events for selected date
  const selectedEvents = useMemo(() => {
    const items: Array<{ id: string; title: string; type: EventType; completed?: boolean; raw: Task | Reminder; sortMin: number }> = []

    for (const t of tasks) {
      if (getDatePart(t.due_date) === selectedDate) {
        items.push({ id: t.id, title: t.title, type: getEventType(t), completed: t.completed, raw: t, sortMin: getSortMinutes(t) })
      }
    }
    for (const r of reminders) {
      if (getDatePart(r.remind_at) === selectedDate) {
        items.push({ id: r.id, title: r.title, type: 'reminder', raw: r, sortMin: getSortMinutes(r) })
      }
    }

    return items.sort((a, b) => a.sortMin - b.sortMin)
  }, [tasks, reminders, selectedDate])

  // Calendar grid
  const calendarDays = useMemo(() => {
    // First day of month
    const firstDay = new Date(viewYear, viewMonth, 1)
    // Day of week for first day (Mon=0, Sun=6)
    let startDow = firstDay.getDay() - 1
    if (startDow < 0) startDow = 6

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

    const cells: Array<{ dateStr: string; day: number } | null> = []
    // Leading nulls
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ dateStr: ds, day: d })
    }
    // Pad trailing nulls to complete the last row
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewYear, viewMonth])

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addTitle.trim()) return
    setSubmitting(true)
    try {
      const dateStr = addTime ? `${selectedDate}T${addTime}` : selectedDate
      await onAddTask(addTitle.trim(), dateStr, addEventType)
      setAddTitle('')
      setAddTime('')
      setAddEventType('task')
      setShowAddForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedDateLabel = toLocalDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div style={{ padding: '16px 14px', maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Calendar</h2>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 18px' }}>Tasks, reminders, and events in one view</p>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button
          onClick={prevMonth}
          style={{ fontSize: 16, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ‹
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{monthLabel}</span>
        <button
          onClick={nextMonth}
          style={{ fontSize: 16, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ›
        </button>
      </div>

      {/* Mini calendar */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '12px 10px',
          marginBottom: 16,
        }}
      >
        {/* Day labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 6 }}>
          {DAY_LABELS.map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', padding: '2px 0' }}>{d}</div>
          ))}
        </div>
        {/* Date cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {calendarDays.map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} />
            const isToday = cell.dateStr === todayStr
            const isSelected = cell.dateStr === selectedDate
            const hasDot = eventDateSet.has(cell.dateStr)
            return (
              <button
                key={cell.dateStr}
                onClick={() => setSelectedDate(cell.dateStr)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '5px 2px',
                  borderRadius: 8,
                  border: 'none',
                  background: isSelected ? 'var(--accent)' : isToday ? 'var(--morning)' : 'transparent',
                  color: isSelected ? '#fff' : isToday ? 'var(--accent)' : 'var(--text)',
                  fontSize: 12,
                  fontWeight: isToday || isSelected ? 700 : 400,
                  cursor: 'pointer',
                  minHeight: 36,
                }}
              >
                {cell.day}
                {hasDot && (
                  <div
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--accent)',
                      marginTop: 2,
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day detail panel */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{selectedDateLabel}</p>
            {selectedEvents.length > 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>{selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
          >
            {showAddForm ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <form onSubmit={handleAdd} style={{ marginBottom: 14, padding: '12px 14px', background: 'var(--morning)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ marginBottom: 10 }}>
              <input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="Title..."
                required
                style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {/* Type chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAddEventType(opt.id)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: addEventType === opt.id ? '#fff' : 'var(--text-2)',
                    background: addEventType === opt.id ? EVENT_COLORS[opt.id] : 'var(--surface)',
                    border: `1px solid ${addEventType === opt.id ? EVENT_COLORS[opt.id] : 'var(--border)'}`,
                    borderRadius: 20,
                    padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Time */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 }}>Time (optional)</label>
              <input
                type="time"
                value={addTime}
                onChange={(e) => setAddTime(e.target.value)}
                style={{ fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !addTitle.trim()}
              style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: submitting ? 'var(--text-3)' : 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: submitting ? 'not-allowed' : 'pointer' }}
            >
              {submitting ? 'Adding...' : 'Add'}
            </button>
          </form>
        )}

        {/* Events list */}
        {selectedEvents.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Nothing scheduled for this day.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedEvents.map((ev) => {
              const color = EVENT_COLORS[ev.type]
              const icon = getEventIcon(ev.type)
              const isTask = ev.type === 'task' || (!('remind_at' in ev.raw) && !ev.type)
              return (
                <div
                  key={ev.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '8px 10px',
                    background: 'var(--surface-2)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    opacity: ev.completed ? 0.6 : 1,
                  }}
                >
                  {/* Icon / checkbox */}
                  {'completed' in ev ? (
                    <button
                      onClick={() => onToggleTask(ev.raw as Task)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: `2px solid ${color}`,
                        background: ev.completed ? color : 'transparent',
                        cursor: 'pointer',
                        flexShrink: 0,
                        marginTop: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {ev.completed && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  ) : (
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  )}
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--text)',
                        margin: 0,
                        textDecoration: ev.completed ? 'line-through' : 'none',
                        lineHeight: 1.4,
                      }}
                    >
                      {ev.title}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {ev.type}
                      </span>
                      {ev.sortMin < 1440 && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {String(Math.floor(ev.sortMin / 60)).padStart(2, '0')}:{String(ev.sortMin % 60).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
