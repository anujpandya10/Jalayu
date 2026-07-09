import type { ComponentType } from 'react'
import type { SidebarView } from '@/lib/types'
import { alwaysOnModuleIds, isPremiumModule } from '@/lib/modules-registry'
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
  MessageCircle,
} from 'lucide-react'

export interface NavItem {
  key: SidebarView
  icon: ComponentType<{ size?: number; color?: string }>
  label: string
  badge?: 'dot-red' | 'dot-green' | 'new-pill' | 'premium-lock' | 'trial'
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
      { key: 'feedback', icon: MessageCircle, label: 'Feedback' },
      { key: 'settings', icon: Settings, label: 'Settings' },
    ],
  },
]

const ALWAYS_VISIBLE = new Set<SidebarView>(alwaysOnModuleIds())

/**
 * Filters the nav to a user's enabled modules, then applies premium-lock
 * badging on top. Fallback by design: if `enabled` is null (still loading) or
 * empty (never personalized), the full nav shows — so no existing user's
 * navigation can break. Always-on system modules and owner-only surfaces are
 * kept regardless.
 *
 * Premium gating runs even in the fallback branch — it's access control, not
 * personalization, so it's orthogonal to "show everything if nothing's
 * configured": a premium module without a grant is always badged, whether or
 * not the user has personalized their nav.
 *
 * A premium item is: unchanged if permanently unlocked (owner or explicit
 * grant, i.e. in `grantedPremium`); 'trial' if usable only via an active trial;
 * 'premium-lock' otherwise. Only 'premium-lock' items are non-navigable.
 */
export function visibleNavSections(
  enabled: Set<string> | null,
  grantedPremium?: Set<string> | null,
  trialActive?: boolean,
): typeof NAV_SECTIONS {
  const applyPremiumBadge = (items: NavItem[]) => items.map((it) => {
    if (!isPremiumModule(it.key) || grantedPremium?.has(it.key)) return it
    const badge: NavItem['badge'] = trialActive ? 'trial' : 'premium-lock'
    return { ...it, badge }
  })

  if (!enabled || enabled.size === 0) {
    return NAV_SECTIONS.map(({ section, items }) => ({ section, items: applyPremiumBadge(items) }))
  }
  return NAV_SECTIONS
    .map(({ section, items }) => ({
      section,
      items: applyPremiumBadge(items.filter((it) => it.ownerOnly || ALWAYS_VISIBLE.has(it.key) || enabled.has(it.key))),
    }))
    .filter((s) => s.items.length > 0)
}
