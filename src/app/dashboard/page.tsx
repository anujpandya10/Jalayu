'use client'

import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast, { Toaster } from 'react-hot-toast'
import { useStore } from '@/store/useStore'
import { getDayNumber, todayString, getDisplayName } from '@/lib/utils'
import AIBar from '@/components/dashboard/AIBar'
import HomeContent from '@/components/dashboard/views/HomeContent'
import MyDayView from '@/components/dashboard/views/MyDayView'
import RemindersView from '@/components/dashboard/views/RemindersView'
import MindView from '@/components/dashboard/views/MindView'
import LearningView from '@/components/dashboard/views/LearningView'
import MemoryView from '@/components/dashboard/views/MemoryView'
import ReflectView from '@/components/dashboard/views/ReflectView'
import ProgressView from '@/components/dashboard/views/ProgressView'
import WellnessView from '@/components/dashboard/views/WellnessView'
import PeopleView from '@/components/dashboard/views/PeopleView'
import WidgetsView from '@/components/dashboard/views/WidgetsView'
import MeetingsView from '@/components/dashboard/views/MeetingsView'
import type { Task, Mood, Note, Reflection } from '@/lib/types'

async function getSupabase() {
  const { createClient } = await import('@/lib/supabase')
  return createClient()
}

export default function DashboardPage() {
  const {
    profile,
    tasks,
    todayMood,
    notes,
    todayReflection,
    sidebarView,
    journeyView,
    reminders,
    moodsRecent,
    tasksRecent,
    reflectionsRecent,
    setTodayMood,
    setMoodsRecent,
    addTask,
    updateTask,
    addNote,
    setTodayReflection,
    addReminder,
    updateReminder,
  } = useStore()

  const daysSinceSignup = profile ? getDayNumber(profile.created_at) - 1 : 0
  const name = getDisplayName(profile)

  const handleMoodLog = useCallback(
    async (score: number) => {
      const supabase = await getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const h = new Date().getHours()
      const { data, error } = await supabase
        .from('moods')
        .insert({
          user_id: user.id,
          score,
          time_of_day: h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening',
          energy_level: score,
        })
        .select()
        .single()
      if (!error && data) {
        const mood = data as Mood
        setTodayMood(mood)
        setMoodsRecent([mood, ...useStore.getState().moodsRecent.filter((m) => m.id !== mood.id)].slice(0, 60))
        await supabase
          .from('profiles')
          .update({ growth_score: (profile?.growth_score || 0) + 2 })
          .eq('id', user.id)
        toast.success('Mood logged ✦')
      }
    },
    [profile, setTodayMood, setMoodsRecent],
  )

  const handleAddTask = useCallback(
    async (title: string) => {
      const supabase = await getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: user.id,
          title,
          due_date: todayString(),
          priority: 'medium',
        })
        .select()
        .single()
      if (!error && data) {
        addTask(data as Task)
        toast.success('Task added')
      }
    },
    [addTask],
  )

  const handleToggleTask = useCallback(
    async (task: Task) => {
      const supabase = await getSupabase()
      const newCompleted = !task.completed
      const { error } = await supabase
        .from('tasks')
        .update({
          completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
        })
        .eq('id', task.id)
      if (!error) {
        updateTask(task.id, {
          completed: newCompleted,
          completed_at: newCompleted ? new Date().toISOString() : null,
        })
        if (newCompleted) {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (user) {
            await supabase
              .from('profiles')
              .update({ growth_score: (profile?.growth_score || 0) + 5 })
              .eq('id', user.id)
          }
          toast.success('Task done! +5 growth')
        }
      }
    },
    [profile, updateTask],
  )

  const handleSaveNote = useCallback(
    async (content: string) => {
      const supabase = await getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          content,
          type: 'note',
        })
        .select()
        .single()
      if (!error && data) {
        addNote(data as Note)
        await supabase
          .from('profiles')
          .update({ growth_score: (profile?.growth_score || 0) + 3 })
          .eq('id', user.id)
        toast.success('Saved to memory ✦')
      } else {
        toast.error('Could not save. Try again.')
      }
    },
    [profile, addNote],
  )

  const handleSaveTypedNote = useCallback(
    async (content: string, type: string, tags: string[] | null = null) => {
      const supabase = await getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          content,
          type,
          tags,
        })
        .select()
        .single()
      if (!error && data) {
        addNote(data as Note)
        await supabase
          .from('profiles')
          .update({ growth_score: (profile?.growth_score || 0) + 3 })
          .eq('id', user.id)
        toast.success('Saved ✦')
      } else {
        toast.error('Could not save. Try again.')
      }
    },
    [profile, addNote],
  )

  const handleSaveReflection = useCallback(
    async (reflData: { one_word: string; win_of_day: string; tomorrow_note: string }) => {
      const supabase = await getSupabase()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: saved, error } = await supabase
        .from('reflections')
        .upsert(
          {
            user_id: user.id,
            date: todayString(),
            ...reflData,
          },
          { onConflict: 'user_id,date' },
        )
        .select()
        .single()
      if (!error && saved) {
        setTodayReflection(saved as Reflection)
        await supabase
          .from('profiles')
          .update({ growth_score: (profile?.growth_score || 0) + 10 })
          .eq('id', user.id)
        toast.success('Reflection saved ✦ +10 growth')
      } else {
        toast.error('Could not save. Try again.')
      }
    },
    [profile, setTodayReflection],
  )

  const viewContent = (() => {
    switch (sidebarView) {
      case 'dashboard':
        return (
          <>
            <AIBar />
            <HomeContent
              journeyView={journeyView}
              profile={profile}
              tasks={tasks}
              todayMood={todayMood}
              notes={notes}
              moodsRecent={moodsRecent}
              daysSinceSignup={daysSinceSignup}
              onMoodLog={handleMoodLog}
              onAddTask={handleAddTask}
              onToggleTask={handleToggleTask}
            />
          </>
        )
      case 'calendar':
        return (
          <MyDayView
            profile={profile}
            tasks={tasks}
            onAddTask={handleAddTask}
            onToggleTask={handleToggleTask}
          />
        )
      case 'reminders':
        return (
          <RemindersView
            reminders={reminders}
            onAdded={(r) => addReminder(r)}
            onUpdated={(id, u) => updateReminder(id, u)}
          />
        )
      case 'mind':
        return <MindView notes={notes} name={name} onSaveMind={(c) => handleSaveTypedNote(c, 'mind')} />
      case 'meetings':
        return <MeetingsView />
      case 'learning':
        return (
          <LearningView notes={notes} name={name} onSaveLearning={(c) => handleSaveTypedNote(c, 'learning')} />
        )
      case 'memory':
        return (
          <MemoryView
            notes={notes}
            reflections={reflectionsRecent}
            name={name}
            onSaveNote={handleSaveNote}
          />
        )
      case 'reflect':
        return <ReflectView todayReflection={todayReflection} onSave={handleSaveReflection} />
      case 'progress':
        return (
          <ProgressView profile={profile} moodsRecent={moodsRecent} tasksRecent={tasksRecent} />
        )
      case 'wellness':
        return (
          <WellnessView todayMood={todayMood} moodsRecent={moodsRecent} onMoodLog={handleMoodLog} />
        )
      case 'people':
        return (
          <PeopleView
            notes={notes}
            name={name}
            onSavePeopleNote={(c) => handleSaveTypedNote(c, 'people', ['people'])}
          />
        )
      case 'widgets':
        return <WidgetsView />
      default:
        return null
    }
  })()

  return (
    <div style={{ minHeight: '100%' }}>
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: 10, fontSize: 13 } }} />

      <AnimatePresence mode="wait">
        <motion.div
          key={sidebarView}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {viewContent}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
