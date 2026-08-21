#!/bin/bash
set -e

mkdir -p "src/app/history"
cat > "src/app/history/page.tsx" << 'SCRIPT_EOF'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type StandingRow = {
  year: number
  team_name: string | null
  net_score: number
  rank: number
  tiebreaker_avg: number | null
  historical_player_id: string
  historical_players: { canonical_name: string; user_id: string | null } | null
}

type WeeklyScoreRow = {
  year: number
  historical_player_id: string
  score: number
}

export default async function HistoryIndexPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: seasons } = await supabase
    .from('historical_seasons')
    .select('year, weeks_played, had_conference_title')
    .order('year', { ascending: false })

  const { data: standingsData } = await supabase
    .from('historical_standings')
    .select(
      'year, team_name, net_score, rank, tiebreaker_avg, historical_player_id, historical_players(canonical_name, user_id)'
    )
    .order('year', { ascending: false })
    .order('rank', { ascending: true })

  const standings = (standingsData ?? []) as unknown as StandingRow[]

  // Supabase enforces a server-side max-rows cap per request regardless of
  // a client-side .limit() -- historical_weekly_scores has 2118 rows, well
  // past that cap, so a single request silently truncates before reaching
  // the later-inserted years. Real pagination via .range() guarantees every
  // row comes back. `score` also comes back from Supabase as a string
  // (numeric columns are serialized as strings to avoid float precision
  // loss), so it's coerced to a real number immediately -- left as a
  // string, `scores.reduce((a, b) => a + b, 0)` below silently does string
  // concatenation instead of addition.
  const weeklyScores: WeeklyScoreRow[] = []
  {
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('historical_weekly_scores')
        .select('year, historical_player_id, score')
        .range(from, from + pageSize - 1)
      if (error || !data || data.length === 0) break
      weeklyScores.push(
        ...data.map((d) => ({
          year: d.year,
          historical_player_id: d.historical_player_id,
          score: Number(d.score),
        }))
      )
      if (data.length < pageSize) break
      from += pageSize
    }
  }

  const byYear = new Map<number, StandingRow[]>()
  for (const s of standings) {
    if (!byYear.has(s.year)) byYear.set(s.year, [])
    byYear.get(s.year)!.push(s)
  }

  // Regular season net per player/year: sum of every regular-season weekly
  // score minus the single lowest week (charter Sec 4.7), computed directly
  // from real per-week data rather than derived from the stored Net Score
  // column -- confirmed the original spreadsheet's own drop-week formula
  // doesn't always drop the true minimum week.
  const weeksByYearPlayer = new Map<string, number[]>()
  for (const w of weeklyScores) {
    const key = `${w.year}:${w.historical_player_id}`
    if (!weeksByYearPlayer.has(key)) weeksByYearPlayer.set(key, [])
    weeksByYearPlayer.get(key)!.push(w.score)
  }
  const regSeasonNetByYearPlayer = new Map<string, number>()
  for (const [key, scores] of weeksByYearPlayer) {
    const sum = scores.reduce((a, b) => a + b, 0)
    const min = Math.min(...scores)
    regSeasonNetByYearPlayer.set(key, sum - min)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">League History</h1>
        <p className="text-sm text-muted-foreground">
          Final standings, Bonus Team picks, and Win the Week results for every season since
          2019.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href="/history/career"
          className="rounded-lg border border-primary bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10"
        >
          View All-Time Career Stats →
        </Link>
        <Link
          href="/awards"
          className="rounded-lg border border-primary bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10"
        >
          View Awards Ceremony →
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {(seasons ?? []).map((season) => {
          const rows = byYear.get(season.year) ?? []
          const overallChamp = rows.find((r) => r.rank === 1)

          // Regular Season Champion: highest regular-season Net Score wins.
          // Ties broken explicitly by Tiebreaker average (charter Sec 10/15:
          // Net Score, then Tiebreaker, then Gross Score) rather than relying
          // on the incidental order `rows` happens to arrive in.
          let regSeasonChamp: StandingRow | undefined
          let bestRegNet = -Infinity
          let bestRegTiebreaker = -Infinity
          for (const r of rows) {
            const regNet = regSeasonNetByYearPlayer.get(
              `${season.year}:${r.historical_player_id}`
            )
            if (regNet === undefined) continue
            const tiebreaker = r.tiebreaker_avg ?? -Infinity
            const isBetter =
              regNet > bestRegNet ||
              (regNet === bestRegNet && tiebreaker > bestRegTiebreaker)
            if (isBetter) {
              bestRegNet = regNet
              bestRegTiebreaker = tiebreaker
              regSeasonChamp = r
            }
          }

          const samePerson =
            overallChamp?.historical_players?.canonical_name ===
            regSeasonChamp?.historical_players?.canonical_name

          const renderChamp = (c: StandingRow | undefined) =>
            c ? (
              c.team_name ? (
                <>
                  {c.team_name}{' '}
                  <span className="text-muted-foreground">
                    ({c.historical_players?.canonical_name})
                  </span>
                </>
              ) : (
                c.historical_players?.canonical_name
              )
            ) : null

          return (
            <Card key={season.year} className="relative transition-colors hover:bg-accent">
              <Link
                href={`/history/${season.year}`}
                className="absolute inset-0"
                aria-label={`${season.year} Season`}
              />
              <CardHeader>
                <CardTitle className="text-base font-medium">{season.year} Season</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">
                  {rows.length} participant{rows.length === 1 ? '' : 's'}
                  {season.had_conference_title ? ' · Conf. Title Week' : ''}
                </span>
                {samePerson ? (
                  <span className="font-medium">🏆 {renderChamp(overallChamp)}</span>
                ) : (
                  <>
                    <span className="font-medium">🏆 Overall: {renderChamp(overallChamp)}</span>
                    <span className="text-xs text-muted-foreground">
                      🎖️ Regular Season: {renderChamp(regSeasonChamp)}
                    </span>
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
SCRIPT_EOF

mkdir -p "src/app/history/career"
cat > "src/app/history/career/page.tsx" << 'SCRIPT_EOF'
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

  // Supabase enforces a server-side max-rows cap per request (this project
  // returns at most ~1000 rows regardless of a client-side .limit()) --
  // historical_dn_picks has ~2000 relevant rows, so a single request
  // silently truncates before reaching the later-inserted 2024/2025 data.
  // Real pagination via .range() is the only way to guarantee every row
  // comes back, whatever the server's per-request cap actually is.
  type DnPickRow = { historical_player_id: string; year: number; was_correct: boolean | null }
  const dnPicks: DnPickRow[] = []
  {
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('historical_dn_picks')
        .select('historical_player_id, year, was_correct')
        .eq('is_conference_title', false)
        .range(from, from + pageSize - 1)
      if (error || !data || data.length === 0) break
      dnPicks.push(...(data as DnPickRow[]))
      if (data.length < pageSize) break
      from += pageSize
    }
  }

  // Which years Bonus Team (D/N) was actually a real rule -- derived from
  // where picks exist at all, rather than hardcoded, so this stays correct
  // if more historical seasons get added later. Confirmed absent for 2019
  // (no Bonus Team sheet that year, matches the charter's "D/N added 2020").
  const dnEligibleYears = new Set(dnPicks.map((d) => d.year))

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

  for (const d of dnPicks) {
    if (!d.was_correct) continue
    const stat = statsById.get(d.historical_player_id)
    if (stat) stat.dnCorrect += 1
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
          by average finish percentile per season, not raw points. Percentile finish rewards
          strong performances relative to that season&apos;s field, regardless of era.
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
SCRIPT_EOF

mkdir -p "src/app/season"
cat > "src/app/season/page.tsx" << 'SCRIPT_EOF'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Trophy, CheckCircle2, XCircle, Circle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import StandingsExportTable from '@/components/StandingsExportTable'
import SimilaritiesMatrix from '@/components/SimilaritiesMatrix'
import SeasonTabs from '@/components/SeasonTabs'

type SeasonStanding = {
  user_id: string
  display_name: string
  team_name: string | null
  weeks_completed: number
  gross_score: number
  dropped_week_id: string | null
  dropped_week_name: string | null
  dropped_week_score: number | null
  net_score: number
  weeks_won: number
  tiebreaker_avg: number | null
}

type WeekStanding = {
  user_id: string
  display_name: string
  raw_score: number
  win_the_week: boolean
}

type DnPick = {
  picked_team: string
  week_name: string
  kickoff_time: string
  is_correct: boolean | null
}

type MatrixRow = {
  user_a_id: string
  user_a_name: string
  user_b_id: string
  user_b_name: string
  games_compared: number
  games_agreed: number
  agreement_rate: number
}

async function buildStandingsSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seasonId: string,
  seasonName: string,
  currentUserId: string,
  isCommissioner: boolean
) {
  const { data: standingsData } = await supabase.rpc('get_season_standings', {
    p_season_id: seasonId,
  })
  const standings = (standingsData ?? []) as SeasonStanding[]

  const { data: completedWeeks } = await supabase
    .from('weeks')
    .select('id, name, week_number')
    .eq('season_id', seasonId)
    .eq('status', 'complete')
    .order('week_number', { ascending: true })

  const weekRawScores: Record<string, Record<string, number>> = {}
  for (const w of completedWeeks ?? []) {
    const { data: weekData } = await supabase.rpc('get_week_standings', {
      p_week_id: w.id,
    })
    const scoreMap: Record<string, number> = {}
    for (const row of weekData ?? []) {
      scoreMap[row.user_id] = row.raw_score
    }
    weekRawScores[w.id] = scoreMap
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Season Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        <StandingsExportTable
          seasonName={seasonName}
          standings={standings}
          completedWeeks={completedWeeks ?? []}
          weekRawScores={weekRawScores}
          currentUserId={currentUserId}
          isCommissioner={isCommissioner}
        />
      </CardContent>
    </Card>
  )
}

async function buildWinTheWeekSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seasonId: string
) {
  const { data: weeks } = await supabase
    .from('weeks')
    .select('id, name, week_number')
    .eq('season_id', seasonId)
    .eq('status', 'complete')
    .order('week_number')

  const weeksWithWinners = await Promise.all(
    (weeks ?? []).map(async (w) => {
      const { data: weekData } = await supabase.rpc('get_week_standings', {
        p_week_id: w.id,
      })
      const rows = (weekData ?? []) as WeekStanding[]
      const winners = rows.filter((r) => r.win_the_week)
      return { week: w, winners }
    })
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        The highest weekly score earns a bonus point toward Net Score. Ties are broken by the
        Highest Scoring Team pick, then closest predicted Game of the Week combined score, then
        closest margin of victory — genuine co-winners share the week.
      </p>

      {weeksWithWinners.length === 0 ? (
        <p className="text-sm text-muted-foreground">No completed weeks yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {weeksWithWinners.map(({ week, winners }) => (
            <Card key={week.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{week.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {winners.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No winner recorded for this week.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {winners.map((wnr) => (
                      <li key={wnr.user_id} className="flex items-center gap-2 text-sm">
                        <Trophy size={16} className="text-accent" />
                        <span className="font-medium">{wnr.display_name}</span>
                        <span className="text-muted-foreground">
                          — {wnr.raw_score} points
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

async function buildBonusTeamSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seasonId: string,
  currentUserId: string
) {
  const { data: weeks } = await supabase
    .from('weeks')
    .select('id, name')
    .eq('season_id', seasonId)

  const weekIds = (weeks ?? []).map((w) => w.id)
  const weekNameById = new Map((weeks ?? []).map((w) => [w.id, w.name]))

  const { data: games } = weekIds.length
    ? await supabase
        .from('games')
        .select('id, week_id, kickoff_time')
        .in('week_id', weekIds)
        .lte('kickoff_time', new Date().toISOString())
    : { data: [] }

  const gameIds = (games ?? []).map((g) => g.id)
  const weekIdByGameId = new Map((games ?? []).map((g) => [g.id, g.week_id]))
  const kickoffByGameId = new Map((games ?? []).map((g) => [g.id, g.kickoff_time]))

  const { data: dnPicks } = gameIds.length
    ? await supabase
        .from('picks')
        .select('user_id, game_id, picked_team, is_correct')
        .eq('is_double_or_nothing', true)
        .in('game_id', gameIds)
    : { data: [] }

  const { data: allUsers } = await supabase
    .from('users')
    .select('id, display_name')
    .order('display_name')

  const historyByUser: Record<string, DnPick[]> = {}
  for (const p of dnPicks ?? []) {
    const weekId = weekIdByGameId.get(p.game_id)
    const weekName = weekId ? weekNameById.get(weekId) : undefined
    const kickoff = kickoffByGameId.get(p.game_id)
    if (!weekName || !kickoff) continue
    if (!historyByUser[p.user_id]) historyByUser[p.user_id] = []
    historyByUser[p.user_id].push({
      picked_team: p.picked_team,
      week_name: weekName,
      kickoff_time: kickoff,
      is_correct: p.is_correct,
    })
  }

  for (const uid of Object.keys(historyByUser)) {
    historyByUser[uid].sort(
      (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
    )
  }

  const participants = (allUsers ?? []).slice().sort((a, b) =>
    (a.display_name ?? '').localeCompare(b.display_name ?? '')
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Every team used as a Bonus Team pick this season, revealed once that game&apos;s
        kickoff has passed. Each team can only be used once per season.
      </p>

      <div className="flex flex-col gap-3">
        {participants.map((p) => {
          const history = historyByUser[p.id] ?? []
          return (
            <Card key={p.id} className={p.id === currentUserId ? 'border-primary' : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {p.display_name}
                  {p.id === currentUserId && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Bonus Team picks revealed yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {history.map((h, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        {h.is_correct === true && (
                          <CheckCircle2 size={16} className="text-green-600" />
                        )}
                        {h.is_correct === false && (
                          <XCircle size={16} className="text-destructive" />
                        )}
                        {h.is_correct === null && (
                          <Circle size={16} className="text-muted-foreground" />
                        )}
                        <span className="font-medium">{h.picked_team}</span>
                        <span className="text-muted-foreground">— {h.week_name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

async function buildSimilaritiesSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seasonId: string,
  currentUserId: string
) {
  const { data: matrixData } = await supabase.rpc('get_similarities_matrix', {
    p_season_id: seasonId,
  })
  const rows = (matrixData ?? []) as MatrixRow[]

  type Edge = { otherId: string; otherName: string; rate: number; compared: number }
  const edgesByUser: Record<string, Edge[]> = {}
  const nameById: Record<string, string> = {}

  for (const r of rows) {
    nameById[r.user_a_id] = r.user_a_name
    nameById[r.user_b_id] = r.user_b_name

    if (!edgesByUser[r.user_a_id]) edgesByUser[r.user_a_id] = []
    if (!edgesByUser[r.user_b_id]) edgesByUser[r.user_b_id] = []

    edgesByUser[r.user_a_id].push({
      otherId: r.user_b_id,
      otherName: r.user_b_name,
      rate: r.agreement_rate,
      compared: r.games_compared,
    })
    edgesByUser[r.user_b_id].push({
      otherId: r.user_a_id,
      otherName: r.user_a_name,
      rate: r.agreement_rate,
      compared: r.games_compared,
    })
  }

  const participantIds = Object.keys(edgesByUser).sort((a, b) =>
    nameById[a].localeCompare(nameById[b])
  )

  const MIN_GAMES_FOR_HEADLINE = 3

  const myEdges = edgesByUser[currentUserId] ?? []
  const myQualifyingEdges = myEdges.filter((e) => e.compared >= MIN_GAMES_FOR_HEADLINE)
  const myEdgePool = myQualifyingEdges.length > 0 ? myQualifyingEdges : myEdges
  const myMost = myEdgePool.length > 0
    ? myEdgePool.reduce((a, b) => (b.rate > a.rate ? b : a))
    : null
  const myLeast = myEdgePool.length > 0
    ? myEdgePool.reduce((a, b) => (b.rate < a.rate ? b : a))
    : null

  const qualifyingRows = rows.filter((r) => r.games_compared >= MIN_GAMES_FOR_HEADLINE)
  const rowPool = qualifyingRows.length > 0 ? qualifyingRows : rows
  const mostSimilarPair = rowPool.length > 0
    ? rowPool.reduce((a, b) => (b.agreement_rate > a.agreement_rate ? b : a))
    : null
  const leastSimilarPair = rowPool.length > 0
    ? rowPool.reduce((a, b) => (b.agreement_rate < a.agreement_rate ? b : a))
    : null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        See how often you and everyone else pick the same winners, based on games that have
        already kicked off.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No games have kicked off yet this week — check back once picks start locking in.
        </p>
      ) : (
        <>
          {myMost && myLeast && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">You</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <p>
                  Most similar to <span className="font-medium">{myMost.otherName}</span>{' '}
                  ({myMost.rate}%)
                </p>
                <p>
                  Least similar to <span className="font-medium">{myLeast.otherName}</span>{' '}
                  ({myLeast.rate}%)
                </p>
              </CardContent>
            </Card>
          )}

          {mostSimilarPair && leastSimilarPair && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">League-Wide</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <p>
                  Most in sync:{' '}
                  <span className="font-medium">
                    {mostSimilarPair.user_a_name} &amp; {mostSimilarPair.user_b_name}
                  </span>{' '}
                  ({mostSimilarPair.agreement_rate}%)
                </p>
                <p>
                  Furthest apart:{' '}
                  <span className="font-medium">
                    {leastSimilarPair.user_a_name} &amp; {leastSimilarPair.user_b_name}
                  </span>{' '}
                  ({leastSimilarPair.agreement_rate}%)
                </p>
              </CardContent>
            </Card>
          )}

          <SimilaritiesMatrix
            participantIds={participantIds}
            nameById={nameById}
            edgesByUser={edgesByUser}
          />
        </>
      )}
    </div>
  )
}

export default async function SeasonPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .limit(1)

  const season = seasons?.[0]

  if (!season) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 p-4 py-12">
        <h1 className="text-2xl font-semibold">No Active Season</h1>
        <p className="text-sm text-muted-foreground">
          Check back once the commissioner starts a season.
        </p>
      </div>
    )
  }

  const isCommissioner = profile?.role === 'commissioner'

  const [standingsSection, winTheWeekSection, bonusTeamSection, similaritiesSection] =
    await Promise.all([
      buildStandingsSection(supabase, season.id, season.name, user.id, isCommissioner),
      buildWinTheWeekSection(supabase, season.id),
      buildBonusTeamSection(supabase, season.id, user.id),
      buildSimilaritiesSection(supabase, season.id, user.id),
    ])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">{season.name}</h1>
        <p className="text-sm text-muted-foreground">
          Standings, weekly winners, Bonus Team picks, and Similarities, all in one place.
        </p>
      </div>

      <SeasonTabs
        standings={standingsSection}
        winTheWeek={winTheWeekSection}
        bonusTeamHistory={bonusTeamSection}
        similarities={similaritiesSection}
      />
    </div>
  )
}
SCRIPT_EOF

mkdir -p "src/app/commissioner"
cat > "src/app/commissioner/page.tsx" << 'SCRIPT_EOF'
import Link from 'next/link'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const TOOLS = [
  {
    href: '/commissioner/seasons',
    title: 'Manage Seasons',
    description: 'Create seasons and weeks, build slates, activate/deactivate, enter results.',
  },
  {
    href: '/commissioner/invite',
    title: 'Invite Participants',
    description: "Add emails to the signup allowlist. It's the only way new accounts get created.",
  },
  {
    href: '/commissioner/managed-profiles',
    title: 'Managed Profiles',
    description: "For participants who share an inbox and can't get their own sign-in code.",
  },
  {
    href: '/commissioner/feedback',
    title: 'Feedback',
    description: 'See what participants have reported and mark issues resolved.',
  },
  {
    href: '/commissioner/themes',
    title: 'Season Themes',
    description: 'Plan a theme per week ahead of time. It stays hidden from participants until picks open.',
  },
  {
    href: '/commissioner/playlists',
    title: 'Playlists',
    description: "See this week's song submissions for curation, and manage the playlist archive.",
  },
]

export default function CommissionerHubPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 py-12">
      <h1 className="text-2xl font-semibold">Commissioner Tools</h1>

      {TOOLS.map((tool) => (
        <Card key={tool.href} className="relative w-full transition-colors hover:bg-accent">
          <Link href={tool.href} className="absolute inset-0" aria-label={tool.title} />
          <CardHeader>
            <CardTitle className="text-base font-medium">{tool.title}</CardTitle>
            <CardDescription>{tool.description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
SCRIPT_EOF

mkdir -p "src/app/commissioner/managed-profiles"
cat > "src/app/commissioner/managed-profiles/page.tsx" << 'SCRIPT_EOF'
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type ManagedProfile = {
  id: string
  display_name: string
  email: string
  managed_by: string
  manager_display_name: string | null
}

export default function ManagedProfilesPage() {
  const [profiles, setProfiles] = useState<ManagedProfile[]>([])
  const [managingUserEmail, setManagingUserEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [syntheticEmail, setSyntheticEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const supabase = createClient()

  const loadProfiles = async () => {
    // Self-join: managed profiles alongside the display name of whoever
    // manages them, so the list is actually readable (not just raw ids).
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name, email, managed_by, manager:managed_by(display_name)')
      .not('managed_by', 'is', null)

    if (error) {
      setError(error.message)
    } else {
      setProfiles(
        (data ?? []).map((row) => ({
          id: row.id,
          display_name: row.display_name,
          email: row.email,
          managed_by: row.managed_by,
          manager_display_name:
            (row.manager as unknown as { display_name: string } | null)?.display_name ?? null,
        }))
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    setSuccessMsg('')

    const { data, error: fnError } = await supabase.functions.invoke('create-managed-profile', {
      body: { managingUserEmail, displayName, syntheticEmail },
    })

    if (fnError) {
      // Edge Function errors land in fnError but the actual message is in
      // the response body, not fnError.message — have to dig it out.
      const context = (fnError as unknown as { context?: Response }).context
      const body = context ? await context.json().catch(() => null) : null
      setError(body?.error ?? fnError.message)
    } else if (data?.error) {
      setError(data.error)
    } else {
      setSuccessMsg(`Created "${displayName}" — managed by ${managingUserEmail}.`)
      setManagingUserEmail('')
      setDisplayName('')
      setSyntheticEmail('')
      loadProfiles()
    }

    setCreating(false)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <Link href="/commissioner" className="text-sm text-muted-foreground hover:underline">
        ← Commissioner Tools
      </Link>
      <h1 className="text-2xl font-semibold">Managed Profiles</h1>
      <p className="text-sm text-muted-foreground">
        For participants who share an inbox with someone else and can&apos;t get their own
        sign-in code, like a shared household email. The account below logs in normally and
        picks up an extra profile to switch into, so the managed person doesn&apos;t need a
        separate login.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create a Managed Profile</CardTitle>
          <CardDescription>
            Requires an existing account for the person who will do the logging in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="managing-email">Managing user&apos;s email (logs in normally)</Label>
              <Input
                id="managing-email"
                type="email"
                required
                placeholder="grandpa@aol.com"
                value={managingUserEmail}
                onChange={(e) => setManagingUserEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="display-name">Display name for the managed profile</Label>
              <Input
                id="display-name"
                required
                placeholder="Grandma"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="synthetic-email">
                Placeholder email (unique, never checked — used only to satisfy account
                requirements)
              </Label>
              <Input
                id="synthetic-email"
                type="email"
                required
                placeholder="thebuckstopshereapp+grandma@gmail.com"
                value={syntheticEmail}
                onChange={(e) => setSyntheticEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={creating} className="self-start">
              {creating ? 'Creating...' : 'Create Managed Profile'}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {successMsg && <p className="text-sm text-green-700">{successMsg}</p>}
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Existing Managed Profiles</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          profiles.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-4">
              <p className="font-medium">{p.display_name}</p>
              <p className="text-xs text-muted-foreground">
                Managed by {p.manager_display_name ?? p.managed_by}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
SCRIPT_EOF

mkdir -p "src/app/commissioner/themes"
cat > "src/app/commissioner/themes/page.tsx" << 'SCRIPT_EOF'
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { suggestThemeEmoji } from '@/utils/themeEmoji'

type Season = {
  id: string
  name: string
}

type Theme = {
  id: string
  week_number: number
  theme: string
  emoji: string | null
}

export default function SeasonThemesPage() {
  const supabase = createClient()

  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonId] = useState('')
  const [loadingSeasons, setLoadingSeasons] = useState(true)

  const [themes, setThemes] = useState<Theme[]>([])
  const [loadingThemes, setLoadingThemes] = useState(false)
  const [error, setError] = useState('')

  const [addWeek, setAddWeek] = useState('')
  const [addTheme, setAddTheme] = useState('')
  const [addEmoji, setAddEmoji] = useState('')
  const [emojiAutoFilled, setEmojiAutoFilled] = useState(true)
  const [adding, setAdding] = useState(false)

  const [bulkText, setBulkText] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkResult, setBulkResult] = useState('')

  const loadSeasons = async () => {
    setLoadingSeasons(true)
    const { data } = await supabase
      .from('seasons')
      .select('id, name')
      .order('created_at', { ascending: false })

    setSeasons(data ?? [])
    setSeasonId((prev) => prev || data?.[0]?.id || '')
    setLoadingSeasons(false)
  }

  useEffect(() => {
    loadSeasons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadThemes = async () => {
    if (!seasonId) return
    setLoadingThemes(true)
    setError('')

    const { data, error } = await supabase
      .from('season_themes')
      .select('id, week_number, theme, emoji')
      .eq('season_id', seasonId)
      .order('week_number', { ascending: true })

    if (error) setError(error.message)
    else setThemes(data ?? [])
    setLoadingThemes(false)
  }

  useEffect(() => {
    loadThemes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId])

  const handleAdd = async () => {
    setError('')
    const weekNum = parseInt(addWeek, 10)

    if (Number.isNaN(weekNum) || !addTheme.trim()) {
      setError('Week # and a theme are required.')
      return
    }

    setAdding(true)
    const { error } = await supabase.from('season_themes').upsert(
      {
        season_id: seasonId,
        week_number: weekNum,
        theme: addTheme.trim(),
        emoji: addEmoji.trim() || suggestThemeEmoji(addTheme.trim()),
      },
      { onConflict: 'season_id,week_number' }
    )
    setAdding(false)

    if (error) {
      setError(error.message)
      return
    }

    setAddWeek('')
    setAddTheme('')
    setAddEmoji('')
    setEmojiAutoFilled(true)
    loadThemes()
  }

  const handleDelete = async (id: string) => {
    setError('')
    const { error } = await supabase.from('season_themes').delete().eq('id', id)
    if (error) setError(error.message)
    else loadThemes()
  }

  const handleBulkAdd = async () => {
    setBulkResult('')
    setError('')

    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const rows: { season_id: string; week_number: number; theme: string; emoji: string }[] = []
    const skipped: string[] = []

    for (const line of lines) {
      const isTab = line.includes('\t')
      const parts = (isTab ? line.split('\t') : line.split(',')).map((p) => p.trim())
      const weekNum = parseInt(parts[0] ?? '', 10)

      // Tab-separated (Excel paste) has a clean 3rd column for an explicit
      // emoji override. Comma-separated rejoins everything after the week
      // # as the theme instead -- a theme can itself contain a comma, and
      // splitting positionally on commas would wrongly chop it up.
      let theme: string
      let explicitEmoji: string | undefined
      if (isTab) {
        theme = parts[1] ?? ''
        explicitEmoji = parts[2]
      } else {
        theme = parts.slice(1).join(',').trim()
      }

      if (Number.isNaN(weekNum) || !theme) {
        skipped.push(line)
        continue
      }

      rows.push({
        season_id: seasonId,
        week_number: weekNum,
        theme,
        emoji: explicitEmoji || suggestThemeEmoji(theme),
      })
    }

    if (rows.length === 0) {
      setBulkResult('Nothing valid to add — expected one row per line: week #, theme.')
      return
    }

    setBulkSaving(true)
    const { error } = await supabase
      .from('season_themes')
      .upsert(rows, { onConflict: 'season_id,week_number' })
    setBulkSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    setBulkResult(
      `Added/updated ${rows.length} theme${rows.length === 1 ? '' : 's'}.` +
        (skipped.length > 0 ? ` Skipped ${skipped.length} line(s) that didn't parse.` : '')
    )
    setBulkText('')
    loadThemes()
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/commissioner" className="text-sm text-muted-foreground hover:underline">
          ← Commissioner Tools
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Season Themes</h1>
        <p className="text-sm text-muted-foreground">
          Plan a theme per week ahead of time. Each one stays hidden from participants until
          picks open for that week, and the week doesn&apos;t even need to exist yet.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loadingSeasons ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <select
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Add a theme</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="theme-week">Week #</Label>
              <Input
                id="theme-week"
                type="number"
                value={addWeek}
                onChange={(e) => setAddWeek(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label htmlFor="theme-text">Theme</Label>
              <Input
                id="theme-text"
                value={addTheme}
                onChange={(e) => {
                  const value = e.target.value
                  setAddTheme(value)
                  // Keep re-suggesting as they type, until they touch the
                  // emoji field themselves -- at that point their choice
                  // wins and typing more theme text won't overwrite it.
                  if (emojiAutoFilled) setAddEmoji(value.trim() ? suggestThemeEmoji(value) : '')
                }}
                placeholder="e.g. Kickoff Weekend"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="theme-emoji">Emoji</Label>
              <Input
                id="theme-emoji"
                value={addEmoji}
                onChange={(e) => {
                  setAddEmoji(e.target.value)
                  setEmojiAutoFilled(false)
                }}
                placeholder="🎵"
                className="text-center text-lg"
              />
            </div>
          </div>
          <Button onClick={handleAdd} disabled={adding} className="self-start">
            {adding ? 'Saving...' : 'Add theme'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Bulk add the whole season</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            One theme per line: week #, theme, and an optional emoji override — tab or comma
            separated (the emoji column only works with tabs, since a comma-separated theme could
            contain a comma itself). Left off, an emoji is auto-suggested from the theme text.
            Re-pasting a week that already has a theme updates it rather than duplicating.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={'1\tKickoff Weekend\n2\tRivalry Week\t⚔️'}
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
          />
          <Button onClick={handleBulkAdd} disabled={bulkSaving || !bulkText.trim()} className="self-start">
            {bulkSaving ? 'Saving...' : 'Bulk add'}
          </Button>
          {bulkResult && <p className="text-sm text-muted-foreground">{bulkResult}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Planned themes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingThemes ? (
            <Skeleton className="h-24 w-full" />
          ) : themes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No themes planned for this season yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {themes.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">Week {t.week_number}</span> —{' '}
                    {t.emoji ? `${t.emoji} ` : ''}
                    {t.theme}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)}>
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
SCRIPT_EOF

mkdir -p "src/app/commissioner/invite"
cat > "src/app/commissioner/invite/page.tsx" << 'SCRIPT_EOF'
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type AllowedEmail = {
  email: string
  default_display_name: string | null
  pending_managed_profile_name: string | null
  created_at: string
}

export default function InviteParticipantPage() {
  const [allowed, setAllowed] = useState<AllowedEmail[]>([])
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [managedProfileName, setManagedProfileName] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removingEmail, setRemovingEmail] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const supabase = createClient()

  const loadAllowed = async () => {
    const { data, error } = await supabase
      .from('allowed_emails')
      .select('email, default_display_name, pending_managed_profile_name, created_at')
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setAllowed(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadAllowed()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    setError('')
    setSuccessMsg('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = displayName.trim()
    const trimmedManagedName = managedProfileName.trim()

    const { error: insertError } = await supabase.from('allowed_emails').insert({
      email: trimmedEmail,
      default_display_name: trimmedName,
      pending_managed_profile_name: trimmedManagedName || null,
      invited_by: user?.id,
    })

    if (insertError) {
      setError(insertError.code === '23505' ? 'That email is already on the list.' : insertError.message)
      setAdding(false)
      return
    }

    // If a managed profile name was given, pre-create that account now —
    // it's unlinked (managed_by null) until the real person's first
    // login, when claim_pending_managed_profile() links them together
    // automatically. Nothing else for them to do.
    if (trimmedManagedName) {
      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'create-managed-profile',
        { body: { displayName: trimmedManagedName, pending: true } }
      )

      if (fnError || fnData?.error) {
        const context = (fnError as unknown as { context?: Response })?.context
        const body = context ? await context.json().catch(() => null) : null
        setError(
          `${trimmedName} was added, but pre-creating ${trimmedManagedName}'s profile failed: ${
            body?.error ?? fnData?.error ?? fnError?.message
          }`
        )
        setAdding(false)
        loadAllowed()
        return
      }

      await supabase
        .from('allowed_emails')
        .update({ pending_managed_profile_user_id: fnData.id })
        .eq('email', trimmedEmail)

      setSuccessMsg(
        `${trimmedName} can now sign in — send them the link whenever you're ready. ${trimmedManagedName}'s profile is ready and will link to their account automatically on first login.`
      )
    } else {
      setSuccessMsg(
        `${trimmedName} can now sign in — send them the link whenever you're ready. They'll see "Welcome, ${trimmedName}!" the first time they log in.`
      )
    }

    setEmail('')
    setDisplayName('')
    setManagedProfileName('')
    loadAllowed()
    setAdding(false)
  }

  const handleRemove = async (emailToRemove: string) => {
    setRemovingEmail(emailToRemove)
    setError('')

    const { error } = await supabase
      .from('allowed_emails')
      .delete()
      .eq('email', emailToRemove)

    if (error) setError(error.message)
    else loadAllowed()

    setRemovingEmail(null)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <Link href="/commissioner" className="text-sm text-muted-foreground hover:underline">
        ← Commissioner Tools
      </Link>
      <h1 className="text-2xl font-semibold">Invite a Participant</h1>
      <p className="text-sm text-muted-foreground">
        Add their email here, then send them the site link. They&apos;ll enter their own
        email to log in and set up their own profile. Public self-registration is otherwise
        blocked, so only addresses on this list can sign in.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add an Email</CardTitle>
          <CardDescription>
            Their real email, and the name they&apos;ll be welcomed by on first login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="someone@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-name">Display name</Label>
              <Input
                id="invite-name"
                required
                placeholder="e.g. Jake"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="managed-name">
                Managed profile name (optional)
              </Label>
              <Input
                id="managed-name"
                placeholder="e.g. Grandma — leave blank for most invites"
                value={managedProfileName}
                onChange={(e) => setManagedProfileName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Only for someone sharing this exact inbox with someone else, like a spouse. That
                second person&apos;s profile gets set up automatically — the account holder never
                has to do anything themselves.
              </p>
            </div>
            <Button type="submit" disabled={adding} className="self-start">
              {adding ? 'Adding...' : 'Add to Allowlist'}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          {successMsg && <p className="mt-2 text-sm text-green-700">{successMsg}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Allowed to Sign In ({allowed.length})</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : allowed.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet — add one above.</p>
        ) : (
          allowed.map((a) => (
            <div
              key={a.email}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div>
                <p className="font-medium">{a.default_display_name ?? a.email}</p>
                <p className="text-xs text-muted-foreground">{a.email}</p>
                {a.pending_managed_profile_name && (
                  <p className="text-xs text-muted-foreground">
                    + manages {a.pending_managed_profile_name}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={removingEmail === a.email}
                onClick={() => handleRemove(a.email)}
              >
                {removingEmail === a.email ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
SCRIPT_EOF

echo "All subtitle files written."
