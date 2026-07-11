'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { todayString, getDayNumber, getJourneyView } from '@/lib/utils'
import TopBar from '@/components/dashboard/TopBar'
import ChatPanel from '@/components/chat/ChatPanel'
import PremiumLockDialog from '@/components/dashboard/PremiumLockDialog'
import TradingGateDialog from '@/components/dashboard/TradingGateDialog'
import AmbientBackground from '@/components/dashboard/AmbientBackground'
import PwaRegister from '@/components/PwaRegister'
import { isDeepView } from '@/lib/deep-views'
import type { Profile, Task, Mood, Note, Reflection, Insight, Reminder, HealthProfile, Medication, HealthAppointment, MedicalRecord } from '@/lib/types'
// HealthProfile used for array cast below

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const {
    setProfile,
    setTasks,
    setTodayMood,
    setNotes,
    setTodayReflection,
    setInsights,
    setJourneyView,
    setLoading,
    setReminders,
    setMoodsRecent,
    setTasksRecent,
    setReflectionsRecent,
    setHealthProfiles,
    setMedications,
    setHealthAppointments,
    setMedicalRecords,
  } = useStore()
  const sidebarView = useStore((s) => s.sidebarView)
  const onHome = sidebarView === 'dashboard'
  const deep = isDeepView(sidebarView)
  const [initialized, setInitialized] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const today = todayString()
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const sixtyDaysAgoIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      const sixtyDaysAgoDate = sixtyDaysAgoIso.split('T')[0]

      const [profileRes, tasksRes, moodRes, reflectionRes, notesRes, insightsRes, remindersRes, moodsRecentRes, tasksRecentRes, reflectionsRecentRes, healthProfileRes, medsRes, apptRes, recordsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('tasks').select('*').eq('user_id', user.id).eq('due_date', today).order('created_at', { ascending: false }),
        supabase.from('moods').select('*').eq('user_id', user.id).gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`).order('created_at', { ascending: false }).limit(1),
        supabase.from('reflections').select('*').eq('user_id', user.id).eq('date', today).single(),
        supabase.from('notes').select('*').eq('user_id', user.id).gte('created_at', sixtyDaysAgoIso).order('created_at', { ascending: false }).limit(80),
        supabase.from('insights').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(60),
        supabase.from('reminders').select('*').eq('user_id', user.id).order('remind_at', { ascending: true }),
        supabase.from('moods').select('*').eq('user_id', user.id).gte('created_at', fourteenDaysAgo).order('created_at', { ascending: false }).limit(60),
        supabase.from('tasks').select('*').eq('user_id', user.id).gte('created_at', fourteenDaysAgo).order('created_at', { ascending: false }).limit(80),
        supabase.from('reflections').select('*').eq('user_id', user.id).gte('date', sixtyDaysAgoDate).order('date', { ascending: false }).limit(40),
        supabase.from('health_profiles').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('medications').select('*').eq('user_id', user.id).order('is_active', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('health_appointments').select('*').eq('user_id', user.id).order('appointment_date', { ascending: false }).limit(30),
        supabase.from('medical_records').select('*').eq('user_id', user.id).order('record_date', { ascending: false }).limit(50),
      ])

      if (profileRes.data) {
        const prof = profileRes.data as Profile
        setProfile(prof)
        const days = getDayNumber(prof.created_at)
        setJourneyView(getJourneyView(days))

        const lastActive = prof.last_active
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toISOString().split('T')[0]
        if (lastActive !== today) {
          const newStreak =
            lastActive === yesterdayStr ? (prof.streak_count || 0) + 1 : 1
          await supabase.from('profiles').update({ last_active: today, streak_count: newStreak }).eq('id', user.id)
        }
      }

      if (tasksRes.data) setTasks(tasksRes.data as Task[])
      if (moodRes.data && moodRes.data.length > 0) setTodayMood(moodRes.data[0] as Mood)
      if (reflectionRes.data) setTodayReflection(reflectionRes.data as Reflection)
      if (notesRes.data) setNotes(notesRes.data as Note[])
      if (insightsRes.data) setInsights(insightsRes.data as Insight[])
      if (remindersRes.data) setReminders(remindersRes.data as Reminder[])
      if (moodsRecentRes.data) setMoodsRecent(moodsRecentRes.data as Mood[])
      if (tasksRecentRes.data) setTasksRecent(tasksRecentRes.data as Task[])
      if (reflectionsRecentRes.data) setReflectionsRecent(reflectionsRecentRes.data as Reflection[])
      if (healthProfileRes.error) {
        console.error('[dashboard] health_profiles load:', healthProfileRes.error.message)
      } else {
        setHealthProfiles((healthProfileRes.data ?? []) as HealthProfile[])
      }
      if (medsRes.data) setMedications(medsRes.data as Medication[])
      if (apptRes.data) setHealthAppointments(apptRes.data as HealthAppointment[])
      if (recordsRes.data) setMedicalRecords(recordsRes.data as MedicalRecord[])
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
      setInitialized(true)
    }
  }, [router, setProfile, setTasks, setTodayMood, setNotes, setTodayReflection, setInsights, setJourneyView, setLoading, setReminders, setMoodsRecent, setTasksRecent, setReflectionsRecent, setHealthProfiles, setMedications, setHealthAppointments, setMedicalRecords])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (!initialized) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: '-0.02em',
              marginBottom: 20,
              textShadow: 'none',
            }}
          >
            Jala<span style={{ color: 'var(--accent)' }}>yu</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', justifyContent: 'center' }}>
            <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 12 }}>Preparing your command center…</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="dashboard-shell"
      style={{
        display: 'flex',
        height: '100dvh',
        background: 'var(--bg)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <AmbientBackground />

      {/* Main column — full width, no persistent sidebar */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* TopBar — visible on all screen sizes */}
        <div>
          <TopBar />
        </div>

        {/* Scrollable content — on any deep-water view, becomes the dark ground (scoped
            dark tokens + atmosphere) so the notification bar + content read as one dark
            screen. Home additionally gets `.deep-home` hero styling. */}
        <main
          className={`dashboard-main${deep ? ' deep-screen' : ''}${onHome ? ' deep-home' : ''}`}
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0, position: 'relative' }}
        >
          {deep && <AmbientBackground />}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <PwaRegister />
            {children}
          </div>
        </main>
      </div>

      <ChatPanel />
      <PremiumLockDialog />
      <TradingGateDialog />
    </div>
  )
}
