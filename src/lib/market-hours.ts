/**
 * Client-safe US market-hours check (no server deps). Mirrors the server's
 * isUsMarketOpen() — regular session 9:30am–4:00pm ET, weekdays. Uses the ET
 * wall clock so it's correct regardless of the viewer's timezone.
 */
export function isUsMarketOpenNow(): boolean {
  const now = new Date()
  const et = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const wd = et.find((p) => p.type === 'weekday')?.value
  const hh = parseInt(et.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const mm = parseInt(et.find((p) => p.type === 'minute')?.value ?? '0', 10)
  if (wd === 'Sat' || wd === 'Sun') return false
  const mins = hh * 60 + mm
  return mins >= 9 * 60 + 30 && mins < 16 * 60
}
