/**
 * The module registry — Jalayu's "fixed ground."
 *
 * Every capability the platform can give a user is declared here as a
 * manifest: what it is, which life-category it belongs to, and whether it's a
 * deep bespoke module, a generic primitive, a tool, or always-on system glue.
 *
 * This is the catalog the life-intake (and, later, the AI assembler) picks
 * from to compose each person's Jalayu, and the source the dynamic shell reads
 * to render only the modules a user has switched on. Pure metadata — safe to
 * import anywhere (no server-only deps).
 *
 * Module ids mirror `SidebarView` in types.ts so the registry lines up 1:1
 * with the existing navigation.
 */
import type { SidebarView } from '@/lib/types'

export type LifeCategory = 'body' | 'mind' | 'work' | 'people' | 'time'

/**
 * rich      — a deep, bespoke domain worth hand-building (Trading, Health).
 * primitive — a generic shape the AI bends into anything (tracker, journal).
 * tool      — a focused utility, usually feeding other modules (Meetings).
 * system    — always-on platform glue the user can't turn off (Dashboard).
 */
export type ModuleKind = 'rich' | 'primitive' | 'tool' | 'system'

export interface ModuleManifest {
  id: SidebarView
  label: string
  category: LifeCategory | 'system'
  kind: ModuleKind
  /** One human line — shown in the picker and read by the AI assembler. */
  description: string
  /** Lucide icon name, for the picker UI. */
  icon: string
  /** System modules every user always has; never offered in the intake. */
  alwaysOn?: boolean
}

export const LIFE_CATEGORIES: { id: LifeCategory; title: string; blurb: string }[] = [
  { id: 'body',   title: 'Body & Health',    blurb: 'How you physically are — sleep, energy, food, medical.' },
  { id: 'mind',   title: 'Mind & Feelings',  blurb: 'How you mentally are — mood, focus, reflection, growth.' },
  { id: 'work',   title: 'Work & Money',     blurb: 'How you provide and build — work, business, investing.' },
  { id: 'people', title: 'People & Love',    blurb: 'Who you are connected to — family, partner, friends, network.' },
  { id: 'time',   title: 'Time & Direction', blurb: 'How you run your days and what you are working toward.' },
]

export const MODULE_REGISTRY: ModuleManifest[] = [
  // ── Body & Health ──
  { id: 'health',     label: 'Health',       category: 'body',   kind: 'rich',      icon: 'stethoscope',  description: 'Medications, appointments, records, and coverage in one place.' },

  // ── Mind & Feelings ──
  { id: 'wellness',   label: 'Wellness',     category: 'mind',   kind: 'primitive', icon: 'heart',        description: 'Track how you feel over time and see the rhythm, not the noise.' },
  { id: 'mind',       label: 'My mind',      category: 'mind',   kind: 'primitive', icon: 'brain',        description: 'A private space to dump what is looping in your head.' },
  { id: 'progress',   label: 'Progress',     category: 'mind',   kind: 'rich',      icon: 'trending-up',  description: 'Honest signals from what you log — mood, streaks, follow-through.' },
  { id: 'memory',     label: 'Memory',       category: 'mind',   kind: 'rich',      icon: 'sparkles',     description: 'What Jalayu remembers about you, so it gets more useful over time.' },
  { id: 'learning',   label: 'Learning',     category: 'mind',   kind: 'tool',      icon: 'graduation-cap', description: 'Pick up new skills with a guided, paced plan.' },

  // ── Work & Money ──
  { id: 'trading',    label: 'Trading',      category: 'work',   kind: 'rich',      icon: 'line-chart',   description: 'A live signal engine and paper account to learn the markets.' },
  { id: 'academy',    label: 'Academy',      category: 'work',   kind: 'rich',      icon: 'graduation-cap', description: 'A trading classroom with a practice desk and an auto-trader.' },
  { id: 'strategylab',label: 'Strategy Lab', category: 'work',   kind: 'rich',      icon: 'flask-conical', description: 'See which strategies actually work and tune the engine.' },
  { id: 'meetings',   label: 'Meetings',     category: 'work',   kind: 'tool',      icon: 'clipboard-list', description: 'Turn a transcript into a summary and real action items.' },
  { id: 'vault',      label: 'Vault',        category: 'work',   kind: 'rich',      icon: 'lock',         description: 'A private, secure store for sensitive notes and accounts.' },

  // ── People & Love ──
  { id: 'people',     label: 'People',       category: 'people', kind: 'rich',      icon: 'users',        description: 'Keep the people who matter close — check-ins, dates, follow-ups.' },

  // ── Time & Direction ──
  { id: 'calendar',   label: 'Calendar',     category: 'time',   kind: 'rich',      icon: 'calendar',     description: 'Your days at a glance, with events and what is coming up.' },
  { id: 'reminders',  label: 'Reminders',    category: 'time',   kind: 'primitive', icon: 'bell',         description: 'Simple nudges so nothing important slips.' },
  { id: 'notes',      label: 'Notes',        category: 'time',   kind: 'rich',      icon: 'file-text',    description: 'A real workspace for your thinking, with version history.' },

  // ── System (always on, never offered in the intake) ──
  { id: 'dashboard',  label: 'Dashboard',    category: 'system', kind: 'system',    icon: 'home',         description: 'Your home base.', alwaysOn: true },
  { id: 'insights',   label: 'Intelligence', category: 'system', kind: 'system',    icon: 'brain',        description: 'The cross-module brain that ties your data into insight.', alwaysOn: true },
  { id: 'widgets',    label: 'Widgets',      category: 'system', kind: 'system',    icon: 'puzzle',       description: 'Shortcuts and embeds — the seed of the module library.', alwaysOn: true },
  { id: 'settings',   label: 'Settings',     category: 'system', kind: 'system',    icon: 'settings',     description: 'Account and preferences.', alwaysOn: true },
]

const BY_ID = new Map(MODULE_REGISTRY.map((m) => [m.id, m]))

export function getModule(id: string): ModuleManifest | undefined {
  return BY_ID.get(id as SidebarView)
}

/** System modules every user always gets, regardless of the intake. */
export function alwaysOnModuleIds(): SidebarView[] {
  return MODULE_REGISTRY.filter((m) => m.alwaysOn).map((m) => m.id)
}
