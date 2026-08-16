import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getCurrentSeason, needsWelcome } from '@/utils/currentSeason'
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

  const season = await getCurrentSeason(supabase)

  // Season-scoped, same check the homepage uses to route people here in
  // the first place — not a plain welcomed_at check, since a returning
  // participant who's already welcomed_at=true for a prior season still
  // needs this page for a new season they haven't set up yet.
  const stillNeedsIt = await needsWelcome(supabase, user.id, season, profile?.welcomed_at ?? null)
  if (!stillNeedsIt) {
    redirect('/')
  }

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
      isReturning={!!profile?.welcomed_at}
    />
  )
}
