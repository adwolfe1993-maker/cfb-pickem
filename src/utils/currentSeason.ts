import type { SupabaseClient } from '@supabase/supabase-js'

export type CurrentSeason = {
  id: string
  name: string
  status: string
}

/**
 * Resolves "the season people should be setting up / picking for right
 * now": prefers the active season, falls back to the most recently
 * created upcoming one. Used so setup/pick flows work ahead of a season
 * officially going active, not just once it's already underway.
 */
export async function getCurrentSeason(
  supabase: SupabaseClient
): Promise<CurrentSeason | null> {
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name, status')
    .in('status', ['active', 'upcoming'])
    .order('created_at', { ascending: false })

  const season = seasons?.find((s) => s.status === 'active') ?? seasons?.[0] ?? null
  return season ?? null
}

/**
 * Whether this user still needs the /welcome guide.
 *
 * Deliberately season-scoped, not a one-time-ever flag: a `season_profiles`
 * row is per (user, season), so a returning participant who completed
 * onboarding for a prior season correctly gets prompted again once a new
 * season exists and they haven't set a team name for it yet — a global
 * "seen it once" flag would silently skip that and leave them without a
 * team name until they thought to visit /profile on their own.
 *
 * Falls back to the account-level `welcomed_at` flag only when there's no
 * current season at all (off-season) — so brand new users still see some
 * welcome experience even with nothing season-specific to set up yet.
 */
export async function needsWelcome(
  supabase: SupabaseClient,
  userId: string,
  season: CurrentSeason | null,
  welcomedAt: string | null
): Promise<boolean> {
  if (!season) {
    return !welcomedAt
  }

  const { data: existingProfile } = await supabase
    .from('season_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('season_id', season.id)
    .maybeSingle()

  return !existingProfile
}
