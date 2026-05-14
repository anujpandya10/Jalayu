import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function getDayNumber(createdAt: string): number {
  return differenceInDays(new Date(), new Date(createdAt)) + 1
}

export function formatDate(): string {
  return format(new Date(), 'EEEE, MMMM d')
}

export function todayString(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function getInitial(name: string | null | undefined): string {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}

/** Determine which journey view to default to based on days since signup */
export function getJourneyView(
  daysSinceSignup: number
): 'day1' | 'day2' | 'day7' | 'day30' {
  if (daysSinceSignup >= 28) return 'day30'
  if (daysSinceSignup >= 6) return 'day7'
  if (daysSinceSignup >= 1) return 'day2'
  return 'day1'
}

export function getDisplayName(
  profile: { nickname?: string | null; full_name?: string | null } | null
): string {
  return profile?.nickname || profile?.full_name || 'you'
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
