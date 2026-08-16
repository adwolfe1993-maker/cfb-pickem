import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import WelcomeFlow from './WelcomeFlow'

export default async function WelcomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, welcomed_at')
    .eq('id', user.id)
    .single()

  // Not a gate against "already did this once" in the strict sense —
  // revisiting /welcome after finishing is harmless — but bookmarking or
  // hitting back shouldn't re-run the guide unprompted. /profile is the
  // anytime-editable version of the same fields.
  if (profile?.welcomed_at) {
    redirect('/')
  }

  // Current-season resolution, same "active, else most recent upcoming"
  // logic as /profile — this intentionally does NOT restrict to active
  // only, so people can set up their team name ahead of the season
  // actually starting.
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name, status')
    .in('status', ['active', 'upcoming'])
    .order('created_at', { ascending: false })

  const season = seasons?.find((s) => s.status === 'active') ?? seasons?.[0] ?? null

  let existingTeamName = ''
  if (season) {
    const { data: existingProfile } = await supabase
      .from('season_profiles')
      .select('team_name')
      .eq('user_id', user.id)
      .eq('season_id', season.id)
      .maybeSingle()

    existingTeamName = existingProfile?.team_name ?? ''
  }

  return (
    <WelcomeFlow
      displayName={profile?.display_name ?? ''}
      seasonId={season?.id ?? null}
      seasonName={season?.name ?? ''}
      initialTeamName={existingTeamName}
    />
  )
}
