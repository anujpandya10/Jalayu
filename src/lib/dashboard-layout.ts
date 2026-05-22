export type DashboardColumn = 'left' | 'center' | 'right'

export type WidgetSize = 'small' | 'medium' | 'large'

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
  | 'notes'
  | 'vault'

export interface DashboardLayout {
  version: 2 | 3
  columns: Record<DashboardColumn, HomeWidgetId[]>
  mobile: HomeWidgetId[]
  hidden: HomeWidgetId[]
  sizes: Partial<Record<HomeWidgetId, WidgetSize>>
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
  notes: 'Notes',
  vault: 'Vault',
}

export const SIZE_LABELS: Record<WidgetSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

const DEFAULT_SIZES: Partial<Record<HomeWidgetId, WidgetSize>> = {
  identity: 'medium',
  morning_note: 'medium',
  ask_jalayu: 'medium',
  quote: 'medium',
  reflection: 'medium',
  mood: 'small',
  health: 'small',
  schedule: 'large',
  trading: 'medium',
  north_star: 'small',
  progress: 'small',
  explore: 'medium',
  strategy_lab: 'small',
  memory: 'small',
  notes: 'medium',
  vault: 'medium',
}

/**
 * V3 layout — focused "Daily + trading" default.
 * Only essentials show on home. Everything else accessible via sidebar.
 * Existing users keep their v2 layout until they hit "Reset to focused layout"
 * in the Widgets manager.
 */
const DEFAULT_LAYOUT: DashboardLayout = {
  version: 3,
  columns: {
    left: ['identity', 'morning_note', 'ask_jalayu'],
    center: ['schedule', 'mood', 'trading'],
    right: ['notes', 'vault'],
  },
  mobile: [
    'identity',
    'morning_note',
    'ask_jalayu',
    'schedule',
    'mood',
    'trading',
    'notes',
    'vault',
  ],
  // Everything below is available via the Widgets manager — just not shown by default.
  hidden: ['quote', 'reflection', 'health', 'north_star', 'progress', 'explore', 'strategy_lab', 'memory'],
  sizes: { ...DEFAULT_SIZES },
}

const ALL_WIDGETS = new Set(Object.keys(WIDGET_LABELS) as HomeWidgetId[])
const SIZE_ORDER: WidgetSize[] = ['small', 'medium', 'large']

function isWidgetId(v: string): v is HomeWidgetId {
  return ALL_WIDGETS.has(v as HomeWidgetId)
}

function isWidgetSize(v: string): v is WidgetSize {
  return v === 'small' || v === 'medium' || v === 'large'
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

function sanitizeSizes(raw: unknown): Partial<Record<HomeWidgetId, WidgetSize>> {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SIZES }
  const out: Partial<Record<HomeWidgetId, WidgetSize>> = { ...DEFAULT_SIZES }
  for (const [k, v] of Object.entries(raw)) {
    if (isWidgetId(k) && typeof v === 'string' && isWidgetSize(v)) out[k] = v
  }
  return out
}

function mergeLists(existing: HomeWidgetId[], defaults: HomeWidgetId[]): HomeWidgetId[] {
  const out = [...existing]
  for (const id of defaults) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

export function getDefaultDashboardLayout(): DashboardLayout {
  return JSON.parse(JSON.stringify(DEFAULT_LAYOUT)) as DashboardLayout
}

/** Migrate v1 layouts and merge sizes */
export function parseDashboardLayout(raw: unknown): DashboardLayout {
  const base = getDefaultDashboardLayout()
  if (!raw || typeof raw !== 'object') return base

  const o = raw as Record<string, unknown>
  const columns = o.columns as Record<string, unknown> | undefined
  const hidden = sanitizeList(o.hidden)
  const hiddenSet = new Set(hidden)

  // Global seen-set: a widget may only appear in one place.
  // Process order = left → center → right → mobile, so earlier columns win on conflict.
  // This cleans up any duplicates already stored in the DB, not just future ones.
  const seen = new Set<HomeWidgetId>(hidden)

  function dedup(list: HomeWidgetId[]): HomeWidgetId[] {
    const result: HomeWidgetId[] = []
    for (const id of list) {
      if (!seen.has(id)) { result.push(id); seen.add(id) }
    }
    return result.filter((id) => !hiddenSet.has(id))
  }

  const savedLeft   = dedup(sanitizeList(columns?.left))
  const savedCenter = dedup(sanitizeList(columns?.center))
  const savedRight  = dedup(sanitizeList(columns?.right))
  const savedMobile = dedup(sanitizeList(o.mobile))

  // Add genuinely new default widgets (not placed anywhere in the saved layout).
  function addNewDefaults(saved: HomeWidgetId[], defaults: HomeWidgetId[]): HomeWidgetId[] {
    const result = [...saved]
    for (const id of defaults) {
      if (!seen.has(id)) { result.push(id); seen.add(id) }
    }
    return result
  }

  return {
    version: 2,
    columns: {
      left:   addNewDefaults(savedLeft,   base.columns.left),
      center: addNewDefaults(savedCenter, base.columns.center),
      right:  addNewDefaults(savedRight,  base.columns.right),
    },
    mobile: addNewDefaults(savedMobile, base.mobile),
    hidden,
    sizes: sanitizeSizes(o.sizes),
  }
}

export function getWidgetSize(layout: DashboardLayout, id: HomeWidgetId): WidgetSize {
  return layout.sizes[id] ?? DEFAULT_SIZES[id] ?? 'medium'
}

export function setWidgetSize(layout: DashboardLayout, id: HomeWidgetId, size: WidgetSize): DashboardLayout {
  return { ...layout, sizes: { ...layout.sizes, [id]: size } }
}

export function cycleWidgetSize(layout: DashboardLayout, id: HomeWidgetId): DashboardLayout {
  const current = getWidgetSize(layout, id)
  const idx = SIZE_ORDER.indexOf(current)
  const next = SIZE_ORDER[(idx + 1) % SIZE_ORDER.length]
  return setWidgetSize(layout, id, next)
}

/** CSS class for grid placement (center/right/mobile use 2-col grid on wide screens) */
export function widgetSpanClass(size: WidgetSize, column: DashboardColumn | 'mobile'): string {
  if (column === 'left') return 'widget-span-full'
  if (size === 'small') return 'widget-span-half'
  return 'widget-span-full'
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
    sizes: { ...layout.sizes },
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
