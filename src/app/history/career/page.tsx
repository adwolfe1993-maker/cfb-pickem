import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

type StandingRow = {
  year: number
  net_score: number
  rank: number
  historical_players: { id: string; canonical_name: string; user_id: string | null } | null
}

type CareerStat = {
  playerId: string
  name: string
  userId: string | null
  seasons: number
  careerNet: number
  percentileSum: number
  championships: number
  weeksWon: number
  dnCorrect: number
  dnTotal: number
}

export default async function CareerStatsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: standingsData } = await supabase
    .from('historical_standings')
    .select('year, net_score, rank, historical_players(id, canonical_name, user_id)')

  const standings = (standingsData ?? []) as unknown as StandingRow[]

  const { data: seasonsData } = await supabase
    .from('historical_seasons')
    .select('year, weeks_played')

  const weeksPlayedByYear = new Map<number, number>(
    (seasonsData ?? []).map((s) => [s.year, s.weeks_played])
  )

  const { data: wtwData } = await supabase
    .from('historical_win_the_week')
    .select('historical_player_id')

  const { data: dnCorrectData } = await supabase
    .from('historical_dn_picks')
    .select('historical_player_id, was_correct')
    .eq('is_conference_title', false)
    .not('was_correct', 'is', null)

  // Which years Bonus Team (D/N) was actually a real rule -- derived from
  // where picks exist at all, rather than hardcoded, so this stays correct
  // if more historical seasons get added later. Confirmed absent for 2019
  // (no Bonus Team sheet that year, matches the charter's "D/N added 2020").
  const { data: dnYearsData } = await supabase
    .from('historical_dn_picks')
    .select('year')
    .eq('is_conference_title', false)

  const dnEligibleYears = new Set((dnYearsData ?? []).map((r) => r.year))

  // Participants per season, needed to convert a rank into a percentile.
  // Raw points aren't comparable across eras -- Core Four (2024-2025) meant
  // 24 games/week vs ~20 in earlier years, so someone who played mostly in
  // 2024-2025 has a structurally higher point ceiling than someone from
  // 2020-2023. Percentile finish sidesteps that entirely: a win is a win
  // whether the season had 20 games or 24.
  const participantsByYear = new Map<number, number>()
  for (const s of standings) {
    participantsByYear.set(s.year, (participantsByYear.get(s.year) ?? 0) + 1)
  }

  const statsById = new Map<string, CareerStat>()

  for (const s of standings) {
    const p = s.historical_players
    if (!p) continue
    if (!statsById.has(p.id)) {
      statsById.set(p.id, {
        playerId: p.id,
        name: p.canonical_name,
        userId: p.user_id,
        seasons: 0,
        careerNet: 0,
        percentileSum: 0,
        championships: 0,
        weeksWon: 0,
        dnCorrect: 0,
        dnTotal: 0,
      })
    }
    const stat = statsById.get(p.id)!
    const n = participantsByYear.get(s.year) ?? 1
    const percentile = n > 1 ? 1 - (s.rank - 1) / (n - 1) : 1
    stat.seasons += 1
    stat.careerNet += s.net_score
    stat.percentileSum += percentile
    if (s.rank === 1) stat.championships += 1

    // A week they played but never submitted a real D/N pick for still
    // counts against them -- treated as a miss, not silently excluded.
    // So the denominator is every possible D/N week in a season they
    // played (weeks_played), not just weeks where a pick actually exists.
    if (dnEligibleYears.has(s.year)) {
      stat.dnTotal += weeksPlayedByYear.get(s.year) ?? 0
    }
  }

  for (const w of wtwData ?? []) {
    const stat = statsById.get(w.historical_player_id)
    if (stat) stat.weeksWon += 1
  }

  for (const d of dnCorrectData ?? []) {
    const stat = statsById.get(d.historical_player_id)
    if (!stat || !d.was_correct) continue
    stat.dnCorrect += 1
  }

  const rows = [...statsById.values()].sort((a, b) => {
    return b.percentileSum / b.seasons - a.percentileSum / a.seasons
  })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/history" className="text-sm text-muted-foreground hover:underline">
          ← League History
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">All-Time Career Stats</h1>
        <p className="text-sm text-muted-foreground">
          Aggregated across every season since the league&apos;s first year in 2019. Ranked
          by average finish percentile per season, not raw points — Core Four (2024–2025)
          meant more games per week, so a raw points average would unfairly favor those
          years. Percentile finish rewards strong performances relative to that
          season&apos;s field, regardless of era.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-0 divide-y divide-border pt-6">
          {rows.map((r, i) => {
            const isYou = r.userId === user.id
            const dnRate = r.dnTotal > 0 ? Math.round((r.dnCorrect / r.dnTotal) * 100) : null
            const avgPercentile = Math.round((r.percentileSum / r.seasons) * 100)
            return (
              <div key={r.playerId} className="flex flex-col gap-1.5 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    <span className="text-muted-foreground">{i + 1}. </span>
                    {r.name}
                    {isYou && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-semibold">{avgPercentile}th percentile</span>
                    <span className="text-xs text-muted-foreground">{r.careerNet} career pts</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {r.seasons} season{r.seasons === 1 ? '' : 's'}
                  </span>
                  {r.championships > 0 && (
                    <span>
                      🏆 {r.championships} championship{r.championships === 1 ? '' : 's'}
                    </span>
                  )}
                  {r.weeksWon > 0 && (
                    <span>
                      {r.weeksWon} week{r.weeksWon === 1 ? '' : 's'} won
                    </span>
                  )}
                  {dnRate !== null && (
                    <span>
                      Bonus Team: {r.dnCorrect}/{r.dnTotal} ({dnRate}%)
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Percentile finish: 100th = won the season, 0th = last place, scaled to that
        season&apos;s participant count. Win the Week is only tracked for 2024–2025 (it
        wasn&apos;t a real rule before then). Bonus Team wasn&apos;t part of the rules in
        the league&apos;s first year (2019) — success rate is out of every possible week
        in a season played from 2020 on, and a week with no Bonus Team pick submitted
        counts as a miss, not an exclusion. Conference Title Week picks aren&apos;t
        included, since outcomes weren&apos;t tracked for them in the source data.
      </p>
    </div>
  )
}
