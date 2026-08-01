import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function PicksStatusIndexRedirect() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: seasons } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .limit(1)

  const season = seasons?.[0]

  if (!season) {
    redirect('/')
  }

  const { data: activeWeeks } = await supabase
    .from('weeks')
    .select('id')
    .eq('season_id', season.id)
    .eq('status', 'active')
    .limit(1)

  const activeWeek = activeWeeks?.[0]

  if (activeWeek) {
    redirect(`/picks/${activeWeek.id}/status`)
  }

  const { data: latestWeeks } = await supabase
    .from('weeks')
    .select('id')
    .eq('season_id', season.id)
    .order('week_number', { ascending: false })
    .limit(1)

  const latestWeek = latestWeeks?.[0]

  if (latestWeek) {
    redirect(`/picks/${latestWeek.id}/status`)
  }

  redirect('/')
}
