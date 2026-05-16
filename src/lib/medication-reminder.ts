/** Weekday keys used in reminders.days_of_week */
export const DAILY_DAYS_OF_WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

/** Build reminder fields for a daily medication alert at HH:MM (local). */
export function buildMedicationReminderFields(medicationName: string, timeHHMM: string) {
  const [h, m] = timeHHMM.split(':').map(Number)
  const remind = new Date()
  remind.setHours(h, m || 0, 0, 0)
  if (remind.getTime() <= Date.now()) {
    remind.setDate(remind.getDate() + 1)
  }
  return {
    title: `Take ${medicationName}`,
    remind_at: remind.toISOString(),
    days_of_week: [...DAILY_DAYS_OF_WEEK],
    type: 'medication' as const,
    is_active: true,
  }
}
