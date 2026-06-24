import type { ComponentType } from 'react'
import type { SidebarView } from '@/lib/types'
import { alwaysOnModuleIds } from '@/lib/modules-registry'
import {
  Home,
  CheckSquare,
  BookOpen,
  StickyNote,
  Shield,
  TrendingUp,
  Heart,
  Users,
  Puzzle,
  Mic2,
  Brain,
  Stethoscope,
  FlaskConical,
  GraduationCap,
  Inbox,
  Settings,
} from 'lucide-react'

export interface NavItem {
  key: SidebarView
  icon: ComponentType<{ size?: number; color?: string }>
  label: string
  badge?: 'dot-red' | 'dot-green' | 'new-pill'
  /** Only visible to the project owner (e.g. admin surfaces). */
  ownerOnly?: boolean
}

export const NAV_SECTIONS: { section: string; items: NavItem[] }[] = [
  {
    section: 'Main',
    items: [
      { key: 'dashboard', icon: Home, label: 'Home' },
      { key: 'calendar', icon: CheckSquare, label: 'Calendar' },
      { key: 'notes', icon: StickyNote, label: 'Notes' },
      { key: 'vault', icon: Shield, label: 'Vault', badge: 'new-pill' },
      { key: 'memory', icon: BookOpen, label: 'Memory' },
      { key: 'insights', icon: Brain, label: 'Intelligence' },
    ],
  },
  {
    section: 'More',
    items: [
      { key: 'health', icon: Stethoscope, label: 'Health' },
      { key: 'progress', icon: TrendingUp, label: 'Progress' },
      { key: 'wellness', icon: Heart, label: 'Wellness' },
      { key: 'meetings', icon: Mic2, label: 'Meetings' },
      { key: 'mind', icon: Brain, label: 'My mind' },
      { key: 'people', icon: Users, label: 'People' },
      { key: 'widgets', icon: Puzzle, label: 'Widgets', badge: 'new-pill' },
      { key: 'trading', icon: TrendingUp, label: 'Trading', badge: 'new-pill' },
      { key: 'academy', icon: GraduationCap, label: 'Academy', badge: 'new-pill' },
      { key: 'strategylab', icon: FlaskConical, label: 'Strategy Lab', badge: 'new-pill' },
      { key: 'signuprequests', icon: Inbox, label: 'Sign-up requests', badge: 'dot-green', ownerOnly: true },
      { key: 'settings', icon: Settings, label: 'Settings' },
    ],
  },
]

const ALWAYS_VISIBLE = new Set<SidebarView>(alwaysOnModuleIds())

/**
 * Filters the nav to a user's enabled modules. Fallback by design: if `enabled`
 * is null (still loading) or empty (never personalized), the full nav shows —
 * so no existing user's navigation can break. Always-on system modules and
 * owner-only surfaces are kept regardless.
 */
export function visibleNavSections(enabled: Set<string> | null): typeof NAV_SECTIONS {
  if (!enabled || enabled.size === 0) return NAV_SECTIONS
  return NAV_SECTIONS
    .map(({ section, items }) => ({
      section,
      items: items.filter((it) => it.ownerOnly || ALWAYS_VISIBLE.has(it.key) || enabled.has(it.key)),
    }))
    .filter((s) => s.items.length > 0)
}
