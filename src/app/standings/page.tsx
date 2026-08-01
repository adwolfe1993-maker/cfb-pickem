import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function StandingsIndexRedirect() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: activeSeasons } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .limit(1)

  const activeSeason = activeSeasons?.[0]

  if (activeSeason) {
    redirect(`/standings/${activeSeason.id}`)
  }

  const { data: latestSeasons } = await supabase
    .from('seasons')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)

  const latestSeason = latestSeasons?.[0]

  if (latestSeason) {
    redirect(`/standings/${latestSeason.id}`)
  }

  redirect('/')
}
