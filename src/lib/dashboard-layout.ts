export type DashboardColumn = 'left' | 'center' | 'right'

export type HomeWidgetId =
  | 'identity'
  | 'morning_note'
  | 'ask_jalayu'
  | 'quote'
  | 'reflection'
  | 'mood'
  | 'health'
  | 'schedule'
  | 'trading'
  | 'north_star'
  | 'progress'
  | 'explore'
  | 'strategy_lab'
  | 'memory'

export interface DashboardLayout {
  version: 1
  columns: Record<DashboardColumn, HomeWidgetId[]>
  mobile: HomeWidgetId[]
  hidden: HomeWidgetId[]
}

export const WIDGET_LABELS: Record<HomeWidgetId, string> = {
  identity: 'You & clock',
  morning_note: 'Morning note',
  ask_jalayu: 'Ask Jalayu',
  quote: 'Daily inspiration',
  reflection: "Today's reflection",
  mood: 'Mood',
  health: 'Health',
  schedule: 'Schedule',
  trading: 'Trading',
  north_star: 'North star',
  progress: 'Progress',
  explore: 'Explore',
  strategy_lab: 'Strategy Lab',
  memory: 'Memory',
}

const DEFAULT_LAYOUT: DashboardLayout = {
  version: 1,
  columns: {
    left: ['identity', 'morning_note', 'ask_jalayu'],
    center: ['quote', 'mood', 'health', 'schedule', 'trading'],
    right: ['reflection', 'north_star', 'progress', 'explore', 'strategy_lab', 'memory'],
  },
  mobile: [
    'quote',
    'reflection',
    'mood',
    'health',
    'schedule',
    'trading',
    'progress',
    'explore',
    'strategy_lab',
    'memory',
    'north_star',
  ],
  hidden: [],
}

const ALL_WIDGETS = new Set(Object.keys(WIDGET_LABELS) as HomeWidgetId[])

function isWidgetId(v: string): v is HomeWidgetId {
  return ALL_WIDGETS.has(v as HomeWidgetId)
}

function sanitizeList(raw: unknown): HomeWidgetId[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<HomeWidgetId>()
  const out: HomeWidgetId[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || !isWidgetId(item) || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

function mergeLists(existing: HomeWidgetId[], defaults: HomeWidgetId[]): HomeWidgetId[] {
  const hidden = new Set(existing)
  const out = [...existing]
  for (const id of defaults) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

export function getDefaultDashboardLayout(): DashboardLayout {
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT)) as DashboardLayout
}

export function parseDashboardLayout(raw: unknown): DashboardLayout {
  const base = getDefaultDashboardLayout()
  if (!raw || typeof raw !== 'object') return base

  const o = raw as Record<string, unknown>
  const columns = o.columns as Record<string, unknown> | undefined

  const hidden = sanitizeList(o.hidden)
  const hiddenSet = new Set(hidden)

  const parsed: DashboardLayout = {
    version: 1,
    columns: {
      left: mergeLists(sanitizeList(columns?.left), base.columns.left).filter((id) => !hiddenSet.has(id)),
      center: mergeLists(sanitizeList(columns?.center), base.columns.center).filter((id) => !hiddenSet.has(id)),
      right: mergeLists(sanitizeList(columns?.right), base.columns.right).filter((id) => !hiddenSet.has(id)),
    },
    mobile: mergeLists(sanitizeList(o.mobile), base.mobile).filter((id) => !hiddenSet.has(id)),
    hidden,
  }

  return parsed
}

export function visibleWidgets(layout: DashboardLayout, column: DashboardColumn): HomeWidgetId[] {
  const hidden = new Set(layout.hidden)
  return layout.columns[column].filter((id) => !hidden.has(id))
}

export function visibleMobileWidgets(layout: DashboardLayout): HomeWidgetId[] {
  const hidden = new Set(layout.hidden)
  return layout.mobile.filter((id) => !hidden.has(id))
}

export function hideWidget(layout: DashboardLayout, id: HomeWidgetId): DashboardLayout {
  if (layout.hidden.includes(id)) return layout
  const next = { ...layout, hidden: [...layout.hidden, id] }
  next.columns = {
    left: next.columns.left.filter((w) => w !== id),
    center: next.columns.center.filter((w) => w !== id),
    right: next.columns.right.filter((w) => w !== id),
  }
  next.mobile = next.mobile.filter((w) => w !== id)
  return next
}

export function showWidget(layout: DashboardLayout, id: HomeWidgetId, column: DashboardColumn = 'center'): DashboardLayout {
  const hidden = layout.hidden.filter((w) => w !== id)
  const next = { ...layout, hidden }
  if (!next.columns[column].includes(id)) {
    next.columns = { ...next.columns, [column]: [...next.columns[column], id] }
  }
  if (!next.mobile.includes(id)) {
    next.mobile = [...next.mobile, id]
  }
  return next
}

export function moveWidget(
  layout: DashboardLayout,
  activeId: HomeWidgetId,
  from: DashboardColumn | 'mobile',
  to: DashboardColumn | 'mobile',
  toIndex: number,
): DashboardLayout {
  const next: DashboardLayout = {
    ...layout,
    columns: {
      left: [...layout.columns.left],
      center: [...layout.columns.center],
      right: [...layout.columns.right],
    },
    mobile: [...layout.mobile],
    hidden: [...layout.hidden],
  }

  const removeFrom = (list: HomeWidgetId[]) => list.filter((id) => id !== activeId)

  if (from === 'mobile') next.mobile = removeFrom(next.mobile)
  else next.columns[from] = removeFrom(next.columns[from])

  const targetList = to === 'mobile' ? next.mobile : next.columns[to]
  const clamped = Math.max(0, Math.min(toIndex, targetList.length))
  targetList.splice(clamped, 0, activeId)

  if (to === 'mobile') next.mobile = targetList
  else next.columns[to] = targetList

  return next
}
