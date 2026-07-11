import type { SidebarView } from '@/lib/types'

/**
 * Views rendered on the deep-water dark ground (scoped via `.deep-screen` in globals.css
 * + dark TopBar). We're rolling the dark treatment out section by section, so this set
 * grows as each view is upgraded — add a view's id here the moment it's converted.
 * Home (`dashboard`) additionally gets `.deep-home` hero styling on top of `.deep-screen`.
 */
export const DEEP_VIEWS = new Set<SidebarView>(['dashboard', 'calendar', 'reminders'])

export function isDeepView(v: SidebarView): boolean {
  return DEEP_VIEWS.has(v)
}
