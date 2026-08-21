#!/bin/bash
set -e

mkdir -p "src/app/awards"
cat > "src/app/awards/page.tsx" << 'SCRIPT_EOF'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// ---------- Shared types ----------

type Winner = { name: string; userId: string | null; value: number }

type SeasonAwards = {
  label: string
  regSeasonChamp: Winner[]
  confChamp: Winner[]
  bigGameBob: Winner[] | null // null = not tracked this season
  steadyEddie: Winner[]
  peytonSnub: Winner[] // empty = nobody was eligible (everyone won a week)
  wellAlwaysHaveParis: Winner[]
  tateForcier: Winner[]
  cardaleJonesCloser: Winner[]
  piratesCode: Winner[] | null // null = not tracked this season
}

function pickWinners<T>(items: T[], value: (t: T) => number, mode: 'max' | 'min'): T[] {
  if (items.length === 0) return []
  const best =
    mode === 'max' ? Math.max(...items.map(value)) : Math.min(...items.map(value))
  return items.filter((t) => value(t) === best)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ---------- Historical (2019-2025) computation ----------

type HistStandingRow = {
  year: number
  net_score: number
  rank: number
  tiebreaker_avg: number | null
  hst_correct_count: number | null
  historical_player_id: string
  historical_players: { canonical_name: string; user_id: string | null } | null
}

type HistWeeklyRow = {
  year: number
  historical_player_id: string
  week_number: number
  score: number
}

type HistSeasonRow = {
  year: number
  weeks_played: number
  had_conference_title: boolean
}

type DnPickRow = {
  year: number
  historical_player_id: string
  was_correct: boolean | null
}

// A player is excluded from the Tate Forcier / Cardale Jones comparison if
// their final 3+ consecutive weeks are all zero -- a clean signal of
// genuinely stopping picks partway through the season rather than normal
// bad-week variance. Confirmed against real 2023-2025 data: every real
// participant has either 0-1 trailing zero weeks, or 5+ -- there's no
// ambiguous middle ground, so this threshold sits safely in the gap.
const DROPOUT_TRAILING_ZERO_THRESHOLD = 3

function trailingZeroCount(weeksAscending: number[]): number {
  let count = 0
  for (let i = weeksAscending.length - 1; i >= 0; i--) {
    if (weeksAscending[i] === 0) count++
    else break
  }
  return count
}

function average(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

function computeHistoricalAwards(
  season: HistSeasonRow,
  standings: HistStandingRow[],
  weeklyScores: HistWeeklyRow[],
  dnPicksThisYear: DnPickRow[],
  dnTrackedThisYear: boolean
): SeasonAwards {
  type Player = {
    playerId: string
    name: string
    userId: string | null
    rank: number
    netScore: number
    hstCorrect: number | null
    dnCorrect: number
    weeksWon: number
    seasonAvg: number
    firstHalfAvg: number
    secondHalfAvg: number
    droppedOut: boolean
  }

  const weeksByPlayer = new Map<string, number[]>()
  for (const w of weeklyScores) {
    if (!weeksByPlayer.has(w.historical_player_id)) weeksByPlayer.set(w.historical_player_id, [])
    weeksByPlayer.get(w.historical_player_id)![w.week_number - 1] = w.score
  }

  // Which weeks each player actually had the single highest score.
  const maxByWeek = new Map<number, number>()
  for (const w of weeklyScores) {
    maxByWeek.set(w.week_number, Math.max(maxByWeek.get(w.week_number) ?? -Infinity, w.score))
  }
  const weeksWonByPlayer = new Map<string, number>()
  for (const w of weeklyScores) {
    if (w.score === maxByWeek.get(w.week_number)) {
      weeksWonByPlayer.set(w.historical_player_id, (weeksWonByPlayer.get(w.historical_player_id) ?? 0) + 1)
    }
  }

  const dnCorrectByPlayer = new Map<string, number>()
  for (const d of dnPicksThisYear) {
    if (d.was_correct) {
      dnCorrectByPlayer.set(
        d.historical_player_id,
        (dnCorrectByPlayer.get(d.historical_player_id) ?? 0) + 1
      )
    }
  }

  const firstHalfCount = Math.ceil(season.weeks_played / 2)

  const players: Player[] = standings.map((s) => {
    const weeks = weeksByPlayer.get(s.historical_player_id) ?? []
    const firstHalf = weeks.slice(0, firstHalfCount)
    const secondHalf = weeks.slice(firstHalfCount)
    return {
      playerId: s.historical_player_id,
      name: s.historical_players?.canonical_name ?? 'Unknown',
      userId: s.historical_players?.user_id ?? null,
      rank: s.rank,
      netScore: s.net_score,
      hstCorrect: s.hst_correct_count,
      dnCorrect: dnCorrectByPlayer.get(s.historical_player_id) ?? 0,
      weeksWon: weeksWonByPlayer.get(s.historical_player_id) ?? 0,
      seasonAvg: average(weeks),
      firstHalfAvg: average(firstHalf),
      secondHalfAvg: average(secondHalf),
      droppedOut: trailingZeroCount(weeks) >= DROPOUT_TRAILING_ZERO_THRESHOLD,
    }
  })

  const toWinners = (ps: Player[], value: (p: Player) => number): Winner[] =>
    ps.map((p) => ({ name: p.name, userId: p.userId, value: value(p) }))

  // Conference/Overall Champion: trusts the DB's `rank` column directly,
  // which is itself resolved Net Score -> Tiebreaker -> Gross Score. No
  // independent tiebreak logic needed here.
  const confChampPlayers = pickWinners(players, (p) => -p.rank, 'max') // rank 1 wins
  const bigGameBobPlayers = dnTrackedThisYear
    ? pickWinners(players, (p) => p.dnCorrect, 'max')
    : null
  const steadyEddiePlayers = pickWinners(players, (p) => p.weeksWon, 'max')
  const zeroWeekPlayers = players.filter((p) => p.weeksWon === 0)
  const peytonSnubPlayers = pickWinners(zeroWeekPlayers, (p) => -p.rank, 'max')
  const wonAtLeastOneWeek = players.filter((p) => p.weeksWon >= 1)
  const parisPlayers = pickWinners(wonAtLeastOneWeek, (p) => p.rank, 'max')

  // Tate Forcier / Cardale Jones: biggest gap between a half-season average
  // and the player's own season-long average -- who most exceeded their own
  // typical performance early (Forcier) or late (Cardale). Players who
  // stopped participating partway through are excluded entirely, since
  // their "average" and half-splits aren't a real signal of form.
  const eligibleForHalfAwards = players.filter((p) => !p.droppedOut)
  const forcierPlayers = pickWinners(
    eligibleForHalfAwards,
    (p) => p.firstHalfAvg - p.seasonAvg,
    'max'
  )
  const cardalePlayers = pickWinners(
    eligibleForHalfAwards,
    (p) => p.secondHalfAvg - p.seasonAvg,
    'max'
  )

  // Pirate's Code: tracked whenever any player has a non-null HST-correct
  // count for the season. This is a dynamic check against real data, not a
  // hardcoded year cutoff, so it stays accurate if source data coverage
  // ever changes.
  const hstTrackedThisYear = players.some((p) => p.hstCorrect !== null)
  const piratesPlayers = hstTrackedThisYear
    ? pickWinners(
        players.filter((p) => p.hstCorrect !== null),
        (p) => p.hstCorrect as number,
        'max'
      )
    : null

  return {
    label: String(season.year),
    regSeasonChamp: [], // filled by caller (needs regular-season-only net score, not passed here)
    confChamp: toWinners(confChampPlayers, (p) => p.netScore),
    bigGameBob: bigGameBobPlayers ? toWinners(bigGameBobPlayers, (p) => p.dnCorrect) : null,
    steadyEddie: toWinners(steadyEddiePlayers, (p) => p.weeksWon),
    peytonSnub: toWinners(peytonSnubPlayers, (p) => p.rank),
    wellAlwaysHaveParis: toWinners(parisPlayers, (p) => p.rank),
    tateForcier: toWinners(forcierPlayers, (p) => round1(p.firstHalfAvg - p.seasonAvg)),
    cardaleJonesCloser: toWinners(cardalePlayers, (p) => round1(p.secondHalfAvg - p.seasonAvg)),
    piratesCode: piratesPlayers ? toWinners(piratesPlayers, (p) => p.hstCorrect as number) : null,
  }
}

// ---------- Rendering ----------

function WinnerLine({ label, winners, note }: { label: string; winners: Winner[] | null; note?: string }) {
  if (winners === null) {
    return (
      <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">Not tracked this season</span>
      </div>
    )
  }
  if (winners.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{note ?? 'No qualifier this season'}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {winners.map((w) => w.name).join(' & ')}
        <span className="ml-1 text-xs text-muted-foreground">({winners[0].value})</span>
      </span>
    </div>
  )
}

export default async function AwardsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: seasonsData }, { data: standingsData }] = await Promise.all([
    supabase
      .from('historical_seasons')
      .select('year, weeks_played, had_conference_title')
      .order('year', { ascending: false }),
    supabase
      .from('historical_standings')
      .select(
        'year, team_name, net_score, rank, tiebreaker_avg, conf_title_score, hst_correct_count, historical_player_id, historical_players(canonical_name, user_id)'
      ),
  ])

  const seasons = (seasonsData ?? []) as HistSeasonRow[]
  const standings = (standingsData ?? []) as unknown as (HistStandingRow & {
    team_name: string | null
    conf_title_score: number | null
  })[]

  // Supabase enforces a server-side max-rows cap per request regardless of
  // a client-side .limit(). historical_weekly_scores (2400+ rows) and
  // historical_dn_picks (2000+ rows) both exceed that cap, so a single
  // request silently truncates before reaching later years -- real
  // pagination via .range() guarantees every row comes back. `score` also
  // comes back from Supabase as a string (numeric columns are serialized
  // as strings to avoid float precision loss), so it's coerced to a real
  // number immediately on fetch rather than trusting the query's shape.
  const weeklyScores: HistWeeklyRow[] = []
  {
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('historical_weekly_scores')
        .select('year, historical_player_id, week_number, score')
        .range(from, from + pageSize - 1)
      if (error || !data || data.length === 0) break
      weeklyScores.push(
        ...data.map((d) => ({
          year: d.year,
          historical_player_id: d.historical_player_id,
          week_number: d.week_number,
          score: Number(d.score),
        }))
      )
      if (data.length < pageSize) break
      from += pageSize
    }
  }

  // One paginated fetch of every non-conference-title D/N pick covers both
  // the correct-pick counts and the "was D/N tracked this year at all"
  // detection -- no need for two separate queries doing the same scan.
  const allDnPicks: DnPickRow[] = []
  {
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('historical_dn_picks')
        .select('year, historical_player_id, was_correct')
        .eq('is_conference_title', false)
        .range(from, from + pageSize - 1)
      if (error || !data || data.length === 0) break
      allDnPicks.push(...(data as DnPickRow[]))
      if (data.length < pageSize) break
      from += pageSize
    }
  }

  const dnTrackedYears = new Set(allDnPicks.map((d) => d.year))

  const allSeasonAwards: SeasonAwards[] = seasons.map((season) => {
    const yearStandings = standings.filter((s) => s.year === season.year)
    const yearWeekly = weeklyScores.filter((w) => w.year === season.year)
    const yearDnPicks = allDnPicks.filter((d) => d.year === season.year)

    const awards = computeHistoricalAwards(
      season,
      yearStandings,
      yearWeekly,
      yearDnPicks,
      dnTrackedYears.has(season.year)
    )

    // Regular Season Champion: sum of weeks minus lowest week (same rule
    // as /history), computed here too so it can sit in the same trophy case.
    // Ties broken explicitly by Tiebreaker average (charter Sec 10/15: Net
    // Score, then Tiebreaker, then Gross Score) -- not by incidental row
    // order, and not left as a shared multi-winner tie unless the
    // tiebreaker is also genuinely tied.
    const weeksByPlayer = new Map<string, number[]>()
    for (const w of yearWeekly) {
      if (!weeksByPlayer.has(w.historical_player_id)) weeksByPlayer.set(w.historical_player_id, [])
      weeksByPlayer.get(w.historical_player_id)!.push(w.score)
    }
    type RegCandidate = {
      historical_player_id: string
      name: string
      userId: string | null
      regNet: number
      tiebreaker: number
    }
    const regCandidates: RegCandidate[] = []
    for (const s of yearStandings) {
      const scores = weeksByPlayer.get(s.historical_player_id)
      if (!scores || scores.length === 0) continue
      const regNet = scores.reduce((a, b) => a + b, 0) - Math.min(...scores)
      regCandidates.push({
        historical_player_id: s.historical_player_id,
        name: s.historical_players?.canonical_name ?? 'Unknown',
        userId: s.historical_players?.user_id ?? null,
        regNet,
        tiebreaker: s.tiebreaker_avg ?? -Infinity,
      })
    }
    const topByRegNet = pickWinners(regCandidates, (c) => c.regNet, 'max')
    const regChamps = pickWinners(topByRegNet, (c) => c.tiebreaker, 'max')
    awards.regSeasonChamp = regChamps.map((c) => ({
      name: c.name,
      userId: c.userId,
      value: c.regNet,
    }))

    return awards
  })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/history" className="text-sm text-muted-foreground hover:underline">
          ← League History
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Awards Ceremony</h1>
        <p className="text-sm text-muted-foreground">
          The trophy case, season by season. Some awards weren&apos;t tracked in every
          year&apos;s source data — those are marked rather than guessed at.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {allSeasonAwards.map((a) => (
          <Card key={a.label}>
            <CardHeader>
              <CardTitle className="text-base font-medium">{a.label} Season</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              <WinnerLine label="🏆 Regular Season Champ" winners={a.regSeasonChamp} />
              <WinnerLine label="🎖️ Conference Champ" winners={a.confChamp} />
              <WinnerLine label="Big Game Bob Award" winners={a.bigGameBob} />
              <WinnerLine label="Steady Eddie Award" winners={a.steadyEddie} />
              <WinnerLine
                label="Peyton Manning Snub"
                winners={a.peytonSnub}
                note="Everyone won at least one week"
              />
              <WinnerLine
                label="We'll Always Have Paris"
                winners={a.wellAlwaysHaveParis}
                note="Nobody with a weekly win finished outside the top spot"
              />
              <WinnerLine label="Tate Forcier September Heisman" winners={a.tateForcier} />
              <WinnerLine label="Cardale Jones Closer" winners={a.cardaleJonesCloser} />
              <WinnerLine label="Pirate's Code" winners={a.piratesCode} />
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Big Game Bob Award: most correct Bonus Team picks. Steady Eddie Award: most weeks with
        the single highest score — dependable excellence, week in and week out. Peyton Manning
        Snub: best final rank among everyone who never had a highest-scoring week. We&apos;ll
        Always Have Paris: worst final rank among everyone who had at least one highest-scoring
        week. Tate Forcier September Heisman / Cardale Jones Closer: biggest gap between a
        player&apos;s first-half (Forcier) or second-half (Cardale) average score and their own
        season-long average — who most exceeded their own typical form early or late. Players
        who stopped participating partway through a season (final 3+ weeks scored zero) are
        excluded from these two. Pirate&apos;s Code: most weeks correctly picking the actual
        highest-scoring team. Bonus Team wasn&apos;t part of the rules until 2020, so Big Game
        Bob shows as not tracked for 2019.
      </p>
    </div>
  )
}
SCRIPT_EOF

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
          Every season since 2019 — final standings, Bonus Team picks, and Win the Week
          results, pulled from the original workbooks.
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

echo "All files written."
