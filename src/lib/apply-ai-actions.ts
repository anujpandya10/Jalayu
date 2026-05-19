import toast from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import type { Task, Mood, Reminder, Note, HealthProfile, Medication, HealthAppointment } from '@/lib/types'

export type AiExecutedAction = {
  type: string
  data: Record<string, unknown>
  message: string
}

/** Apply AI action results to the global store (home chat, side panel, etc.). */
export function applyAiActions(actions: AiExecutedAction[]) {
  const {
    addTask,
    updateTask,
    setTodayMood,
    setMoodsRecent,
    addReminder,
    addNote,
    addHealthProfile,
    updateHealthProfile,
    addMedication,
    addHealthAppointment,
  } = useStore.getState()

  for (const action of actions) {
    switch (action.type) {
      case 'task_added':
        addTask(action.data as unknown as Task)
        toast.success('Task added ✦')
        break
      case 'event_added':
        addTask(action.data as unknown as Task)
        toast.success('Added to calendar ✦')
        break
      case 'mood_logged': {
        const mood = action.data as unknown as Mood
        setTodayMood(mood)
        setMoodsRecent([
          mood,
          ...useStore.getState().moodsRecent.filter((m) => m.id !== mood.id),
        ].slice(0, 60))
        break
      }
      case 'reminder_added':
        addReminder(action.data as unknown as Reminder)
        toast.success('Reminder set ✦')
        break
      case 'memory_saved':
        addNote(action.data as unknown as Note)
        toast.success('Saved to your notes ✦')
        break
      case 'task_completed': {
        const task = action.data as unknown as Task
        updateTask(task.id, { completed: true, completed_at: task.completed_at ?? null })
        toast.success('Task done! ✦')
        break
      }
      case 'decision_tracked':
        addNote(action.data as unknown as Note)
        toast.success('Decision tracked ✦')
        break
      case 'insurance_saved':
        addHealthProfile(action.data as unknown as HealthProfile)
        toast.success(action.message || 'Insurance saved ✦')
        break
      case 'insurance_updated':
        updateHealthProfile(action.data as unknown as HealthProfile)
        toast.success(action.message || 'Insurance updated ✦')
        break
      case 'primary_care_updated':
        updateHealthProfile(action.data as unknown as HealthProfile)
        toast.success(action.message || 'PCP updated ✦')
        break
      case 'medication_saved':
        addMedication(action.data as unknown as Medication)
        toast.success(action.message || 'Medication saved ✦')
        break
      case 'appointment_added':
        addHealthAppointment(action.data as unknown as HealthAppointment)
        toast.success(action.message || 'Appointment added ✦')
        break
      default:
        break
    }
  }
}
