import type { Task, Reminder } from '@/lib/types'

export type ScheduleItemType = 'task' | 'reminder' | 'event' | 'birthday' | 'meeting' | 'google'

export interface GoogleCalEvent {
  title: string
  start: string | null
}

export interface ScheduleItem {
  id: string
  title: string
  type: ScheduleItemType
  sortMin: number
  completed?: boolean
  source: 'task' | 'reminder' | 'google'
  raw: Task | Reminder | GoogleCalEvent
}

export const SCHEDULE_COLORS: Record<ScheduleItemType, string> = {
  task: 'var(--accent)',
  reminder: '#92400E',
  event: '#4B5563',
  birthday: '#15803D',
  meeting: '#1D4ED8',
  google: '#2563EB',
}

export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getDatePart(str: string | null | undefined): string | null {
  if (!str) return null
  return str.slice(0, 10)
}

export function getSortMinutes(item: Task | Reminder | GoogleCalEvent): number {
  if ('due_time' in item && item.due_time) {
    const [h, m] = item.due_time.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  if ('remind_at' in item) {
    try {
      const d = new Date(item.remind_at)
      if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes()
    } catch { /* fall through */ }
  }
  if ('start' in item && item.start?.includes('T')) {
    try {
      const d = new Date(item.start)
      if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes()
    } catch { /* fall through */ }
  }
  return 1440
}

function taskEventType(t: Task): ScheduleItemType {
  if (t.event_type === 'event' || t.event_type === 'birthday' || t.event_type === 'meeting') {
    return t.event_type
  }
  return 'task'
}

function taskMatchesDate(t: Task, dateStr: string, todayStr: string): boolean {
  if (t.completed) return false
  const due = getDatePart(t.due_date)
  if (dateStr === todayStr) {
    return !due || due <= todayStr
  }
  return due === dateStr
}

export function buildScheduleItems(
  tasks: Task[],
  reminders: Reminder[],
  googleEvents: GoogleCalEvent[],
  dateStr: string,
  todayStr: string,
): ScheduleItem[] {
  const items: ScheduleItem[] = []

  for (const t of tasks) {
    if (taskMatchesDate(t, dateStr, todayStr)) {
      items.push({
        id: `task-${t.id}`,
        title: t.title,
        type: taskEventType(t),
        completed: t.completed,
        sortMin: getSortMinutes(t),
        source: 'task',
        raw: t,
      })
    }
  }

  for (const r of reminders) {
    if (!r.is_active) continue
    if (getDatePart(r.remind_at) === dateStr) {
      items.push({
        id: `reminder-${r.id}`,
        title: r.title,
        type: 'reminder',
        sortMin: getSortMinutes(r),
        source: 'reminder',
        raw: r,
      })
    }
  }

  for (let i = 0; i < googleEvents.length; i++) {
    const ev = googleEvents[i]
    if (getDatePart(ev.start) === dateStr) {
      items.push({
        id: `google-${i}-${ev.title}`,
        title: ev.title,
        type: 'google',
        sortMin: getSortMinutes(ev),
        source: 'google',
        raw: ev,
      })
    }
  }

  return items.sort((a, b) => a.sortMin - b.sortMin)
}

export function collectScheduleDates(
  tasks: Task[],
  reminders: Reminder[],
  googleEvents: GoogleCalEvent[],
  todayStr: string,
): Set<string> {
  const set = new Set<string>()
  for (const t of tasks) {
    if (t.completed) continue
    const due = getDatePart(t.due_date)
    if (!due) set.add(todayStr)
    else set.add(due)
  }
  for (const r of reminders) {
    if (!r.is_active) continue
    const dp = getDatePart(r.remind_at)
    if (dp) set.add(dp)
  }
  for (const ev of googleEvents) {
    const dp = getDatePart(ev.start)
    if (dp) set.add(dp)
  }
  return set
}

export function formatScheduleTime(sortMin: number): string | null {
  if (sortMin >= 1440) return null
  const h = Math.floor(sortMin / 60)
  const m = sortMin % 60
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function scheduleItemIcon(type: ScheduleItemType): string {
  if (type === 'reminder') return '🔔'
  if (type === 'birthday') return '🎂'
  if (type === 'meeting') return '💼'
  if (type === 'google') return '📆'
  if (type === 'event') return '📅'
  return ''
}
