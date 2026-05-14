import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.onboarding_complete) {
    redirect('/onboarding')
  }

  redirect('/dashboard')
}
