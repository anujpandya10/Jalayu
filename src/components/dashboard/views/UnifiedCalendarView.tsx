'use client'

import { useState, useMemo, useEffect } from 'react'
import type { Task, Reminder, HealthAppointment } from '@/lib/types'
import {
  buildScheduleItems,
  collectScheduleDates,
  formatScheduleTime,
  scheduleItemIcon,
  SCHEDULE_COLORS,
  toLocalDateStr,
  type GoogleCalEvent,
  type ScheduleItem,
} from '@/lib/schedule'

interface UnifiedCalendarViewProps {
  tasks: Task[]
  reminders: Reminder[]
  healthAppointments?: HealthAppointment[]
  onAddTask: (title: string, date?: string, eventType?: string) => Promise<void>
  onToggleTask: (task: Task) => Promise<void>
  onDeleteTask?: (taskId: string) => Promise<void>
  onEditTask?: (taskId: string, newTitle: string) => Promise<void>
}

type EventType = 'task' | 'reminder' | 'event' | 'birthday' | 'meeting'

const EVENT_TYPE_OPTIONS: { id: EventType; label: string }[] = [
  { id: 'task', label: 'Task' },
  { id: 'reminder', label: 'Reminder' },
  { id: 'event', label: 'Event' },
  { id: 'birthday', label: 'Birthday' },
  { id: 'meeting', label: 'Meeting' },
]

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toLocalDate(dateStr: string): Date {
  // Parse YYYY-MM-DD without timezone shift
  const [y, m, day] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function addDays(dateStr: string, n: number): string {
  const d = toLocalDate(dateStr)
  d.setDate(d.getDate() + n)
  return toLocalDateStr(d)
}

export default function UnifiedCalendarView({
  tasks,
  reminders,
  healthAppointments = [],
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onEditTask,
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [googleEvents, setGoogleEvents] = useState<GoogleCalEvent[]>([])
  const [calConnected, setCalConnected] = useState<boolean | null>(null)

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

  const eventDateSet = useMemo(
    () => collectScheduleDates(tasks, reminders, googleEvents, todayStr, healthAppointments),
    [tasks, reminders, googleEvents, todayStr, healthAppointments],
  )

  const selectedEvents = useMemo(
    () => buildScheduleItems(tasks, reminders, googleEvents, selectedDate, todayStr, healthAppointments),
    [tasks, reminders, googleEvents, selectedDate, todayStr, healthAppointments],
  )

  // How many events each dated cell has — powers the count badges on the grid and the
  // glanceable summary tiles. Only dates that actually have events are scored, so this
  // is a handful of cheap calls, not one per calendar cell.
  const countByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const ds of eventDateSet) {
      m.set(ds, buildScheduleItems(tasks, reminders, googleEvents, ds, todayStr, healthAppointments).length)
    }
    return m
  }, [eventDateSet, tasks, reminders, googleEvents, todayStr, healthAppointments])

  const summary = useMemo(() => {
    const tomorrowStr = addDays(todayStr, 1)
    let week = 0
    for (let i = 0; i < 7; i++) week += countByDate.get(addDays(todayStr, i)) ?? 0
    return {
      today: countByDate.get(todayStr) ?? 0,
      tomorrow: countByDate.get(tomorrowStr) ?? 0,
      week,
      tomorrowStr,
    }
  }, [countByDate, todayStr])

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
    <div style={{ padding: '18px 16px 40px', maxWidth: 760, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>Calendar</h2>
        {calConnected === false && (
          <a
            href="/api/calendar/google/start"
            style={{
              fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none',
              background: 'var(--morning)', border: '1px solid var(--border)', borderRadius: 99,
              padding: '6px 12px', whiteSpace: 'nowrap',
            }}
          >
            + Connect Google
          </a>
        )}
      </div>

      {/* Glanceable summary — tap Today / Tomorrow to jump straight to that day */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { key: 'today', label: 'Today', n: summary.today, go: () => { setSelectedDate(todayStr); setViewMonth(today.getMonth()); setViewYear(today.getFullYear()) } },
          { key: 'tomorrow', label: 'Tomorrow', n: summary.tomorrow, go: () => { setSelectedDate(summary.tomorrowStr); const t = toLocalDate(summary.tomorrowStr); setViewMonth(t.getMonth()); setViewYear(t.getFullYear()) } },
          { key: 'week', label: 'Next 7 days', n: summary.week, go: null as null | (() => void) },
        ].map((t) => {
          const active = (t.key === 'today' && selectedDate === todayStr) || (t.key === 'tomorrow' && selectedDate === summary.tomorrowStr)
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => t.go?.()}
              disabled={!t.go}
              className="deep-card"
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: 14,
                background: 'var(--surface)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                cursor: t.go ? 'pointer' : 'default', fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 800, color: t.n > 0 ? 'var(--text)' : 'var(--text-3)', lineHeight: 1 }}>{t.n}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</div>
            </button>
          )
        })}
      </div>

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
            const count = countByDate.get(cell.dateStr) ?? 0
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
                  gap: 3,
                  padding: '6px 2px',
                  borderRadius: 10,
                  border: isToday && !isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                  background: isSelected ? 'var(--accent)' : 'transparent',
                  color: isSelected ? 'var(--accent-fg)' : isToday ? 'var(--accent)' : 'var(--text)',
                  fontSize: 13,
                  fontWeight: isToday || isSelected ? 700 : 500,
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                {cell.day}
                {count > 0 && (
                  <span
                    style={{
                      fontSize: 9, fontWeight: 700, lineHeight: 1,
                      minWidth: 14, height: 14, padding: '0 3px', borderRadius: 99,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--morning)',
                      color: isSelected ? 'var(--accent-fg)' : 'var(--accent)',
                    }}
                  >
                    {count}
                  </span>
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
                    background: addEventType === opt.id ? SCHEDULE_COLORS[opt.id] : 'var(--surface)',
                    border: `1px solid ${addEventType === opt.id ? SCHEDULE_COLORS[opt.id] : 'var(--border)'}`,
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
            {selectedEvents.map((ev: ScheduleItem) => {
              const color = SCHEDULE_COLORS[ev.type]
              const icon = scheduleItemIcon(ev.type)
              const isEditing = editingId === ev.id
              const isDeleting = deletingId === ev.id
              const isTaskType = ev.source === 'task'
              const task = isTaskType ? (ev.raw as Task) : null
              const timeLabel = formatScheduleTime(ev.sortMin)

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
                    border: isDeleting ? '1px solid rgba(220,38,38,0.3)' : '1px solid var(--border)',
                    opacity: ev.completed ? 0.6 : 1,
                  }}
                >
                  {/* Icon / checkbox */}
                  {isTaskType && task ? (
                    <button
                      onClick={() => onToggleTask(task)}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: `2px solid ${color}`,
                        background: ev.completed ? color : 'transparent',
                        cursor: 'pointer',
                        flexShrink: 0,
                        marginTop: isEditing ? 8 : 1,
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

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault()
                          if (editTitle.trim() && onEditTask && task) {
                            await onEditTask(task.id, editTitle.trim())
                          }
                          setEditingId(null)
                        }}
                        style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                      >
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(null) }}
                          style={{
                            flex: 1,
                            fontSize: 13,
                            padding: '4px 8px',
                            border: '1px solid var(--border-2)',
                            borderRadius: 6,
                            background: 'var(--surface)',
                            color: 'var(--text)',
                            outline: 'none',
                            fontFamily: 'inherit',
                          }}
                        />
                        <button type="submit" style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                        <button type="button" onClick={() => setEditingId(null)} style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                      </form>
                    ) : isDeleting ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#DC2626' }}>Delete "{ev.title}"?</span>
                        <button
                          onClick={async () => {
                            if (onDeleteTask && task) await onDeleteTask(task.id)
                            setDeletingId(null)
                          }}
                          style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', background: 'none', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}
                        >Yes</button>
                        <button
                          onClick={() => setDeletingId(null)}
                          style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
                        >No</button>
                      </div>
                    ) : (
                      <>
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: 'var(--text)',
                            margin: 0,
                            textDecoration: ev.completed ? 'line-through' : 'none',
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ev.title}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {ev.type === 'google' ? 'calendar' : ev.type}
                          </span>
                          {timeLabel && (
                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{timeLabel}</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Edit / Delete buttons — only for tasks (not reminders) */}
                  {!isEditing && !isDeleting && isTaskType && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginTop: 1 }}>
                      {onEditTask && (
                        <button
                          onClick={() => { setEditingId(ev.id); setEditTitle(ev.title); setDeletingId(null) }}
                          title="Edit"
                          style={{
                            width: 24, height: 24, borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: 'var(--text-3)',
                          }}
                        >✎</button>
                      )}
                      {onDeleteTask && (
                        <button
                          onClick={() => { setDeletingId(ev.id); setEditingId(null) }}
                          title="Delete"
                          style={{
                            width: 24, height: 24, borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: 'var(--text-3)',
                          }}
                        >✕</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
