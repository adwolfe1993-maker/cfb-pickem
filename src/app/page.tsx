import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FootballField from '@/components/FootballField'
import EnableNotifications from '@/components/EnableNotifications'
import { getCurrentSeason, needsWelcome } from '@/utils/currentSeason'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, role, welcomed_at')
    .eq('id', user.id)
    .single()

  const season = await getCurrentSeason(supabase)
  const showWelcome = await needsWelcome(supabase, user.id, season, profile?.welcomed_at ?? null)

  if (showWelcome) {
    // Claiming a pending managed-profile link (e.g. a spouse's account the
    // commissioner pre-created) is safe to run every time before welcomed_at
    // is set — it's a no-op once already claimed. mark_welcomed itself now

    // happens at the END of the /welcome flow instead of here, so someone
    // who bails out mid-setup still sees the guide next time instead of
    // landing on a bare "Welcome!" card with nothing to do.
    await supabase.rpc('claim_pending_managed_profile')
    redirect('/welcome')
  }

  // Dashboard data — all scoped to the current (active, else most recent
  // upcoming) season, and each section only renders if it has something
  // real to show rather than an empty/placeholder state.
  type SeasonStanding = {
    user_id: string
    display_name: string
    team_name: string | null
    net_score: number
  }
  type WeekStanding = {
    user_id: string
    display_name: string
    team_name: string | null
    win_the_week: boolean
  }

  let topStandings: (SeasonStanding & { rank: number })[] = []
  let activeWeekTheme: { weekId: string; weekName: string; theme: string; emoji: string | null } | null = null
  let lastWeekWinner: { weekName: string; winners: { user_id: string; name: string }[] } | null = null

  if (season) {
    const [{ data: standingsData }, { data: activeWeek }, { data: lastCompleteWeek }] =
      await Promise.all([
        supabase.rpc('get_season_standings', { p_season_id: season.id }),
        supabase
          .from('weeks')
          .select('id, name, week_number')
          .eq('season_id', season.id)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('weeks')
          .select('id, name, week_number')
          .eq('season_id', season.id)
          .eq('status', 'complete')
          .order('week_number', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

    // Top 10 by net score, tie-aware ranking (matches /standings' own
    // convention — equal net_score shares a rank rather than just using
    // array position).
    const sorted = ((standingsData ?? []) as SeasonStanding[])
      .slice()
      .sort((a, b) => b.net_score - a.net_score)
    topStandings = sorted.reduce<(SeasonStanding & { rank: number })[]>((acc, row) => {
      const prev = acc[acc.length - 1]
      const rank = prev && prev.net_score === row.net_score ? prev.rank : acc.length + 1
      acc.push({ ...row, rank })
      return acc
    }, [])
    topStandings = topStandings.filter((r) => r.rank <= 10)

    if (activeWeek) {
      const { data: themeRow } = await supabase
        .from('season_themes')
        .select('theme, emoji')
        .eq('season_id', season.id)
        .eq('week_number', activeWeek.week_number)
        .maybeSingle()

      if (themeRow) {
        activeWeekTheme = {
          weekId: activeWeek.id,
          weekName: activeWeek.name,
          theme: themeRow.theme,
          emoji: themeRow.emoji,
        }
      }
    }

    if (lastCompleteWeek) {
      const { data: weekStandings } = await supabase.rpc('get_week_standings', {
        p_week_id: lastCompleteWeek.id,
      })
      const winners = ((weekStandings ?? []) as WeekStanding[])
        .filter((w) => w.win_the_week)
        .map((w) => ({ user_id: w.user_id, name: w.team_name || w.display_name }))
      lastWeekWinner = { weekName: lastCompleteWeek.name, winners }
    }
  }

  const MEDALS: Record<number, string> = { 1: '🏆 ', 2: '🥈 ', 3: '🥉 ' }

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative flex items-center justify-center p-4">
        <FootballField />

        <Card className="relative z-10 w-full max-w-sm shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">The Buck Stops Here</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <EnableNotifications />
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <p>
                Logged in as <span className="font-medium">{user.email}</span>
              </p>
              <p>
                Display name <span className="font-medium">{profile?.display_name ?? '—'}</span>
              </p>
              <p>
                Role <span className="font-medium">{profile?.role ?? '—'}</span>
              </p>
            </div>
            <Link href="/feedback" className="text-xs text-muted-foreground hover:underline">
              Something not working? Report it →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pb-12">
        {activeWeekTheme && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/picks/${activeWeekTheme.weekId}`} className="flex flex-col gap-1 hover:underline">
                <span className="text-xs text-muted-foreground">{activeWeekTheme.weekName}</span>
                <span className="text-xl font-medium">
                  {activeWeekTheme.emoji ?? '🎵'} {activeWeekTheme.theme}
                </span>
              </Link>
            </CardContent>
          </Card>
        )}

        {lastWeekWinner && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">{lastWeekWinner.weekName} Winner</CardTitle>
            </CardHeader>
            <CardContent>
              {lastWeekWinner.winners.length > 0 ? (
                <p className="text-lg font-semibold">
                  🏆 {lastWeekWinner.winners.map((w) => w.name).join(' & ')}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No weekly winner for this week.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {topStandings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Top 10 — Net Points</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0 divide-y divide-border">
              {topStandings.map((s) => (
                <div key={s.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="text-muted-foreground">{MEDALS[s.rank] ?? `${s.rank}. `}</span>
                    {s.team_name ? (
                      <>
                        <span className="font-medium">{s.team_name}</span>
                        <span className="text-muted-foreground"> ({s.display_name})</span>
                      </>
                    ) : (
                      <span className="font-medium">{s.display_name}</span>
                    )}
                    {s.user_id === user.id && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  <span className="font-semibold">{s.net_score}</span>
                </div>
              ))}
              {season && (
                <Link
                  href={`/standings/${season.id}`}
                  className="pt-3 text-xs text-muted-foreground hover:underline"
                >
                  Full standings →
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
