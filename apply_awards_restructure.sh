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

type AwardKey =
  | 'regSeasonChamp'
  | 'confChamp'
  | 'bigGameBob'
  | 'steadyEddie'
  | 'peytonSnub'
  | 'wellAlwaysHaveParis'
  | 'tateForcier'
  | 'cardaleJonesCloser'
  | 'piratesCode'

const AWARD_DEFS: {
  key: AwardKey
  label: string
  description: string
  emptyNote?: string
}[] = [
  {
    key: 'regSeasonChamp',
    label: '🏆 Regular Season Champ',
    description:
      'Highest Net Score through the end of the regular season, before Conference Title Week. Ties are broken by Tiebreaker average.',
  },
  {
    key: 'confChamp',
    label: '🎖️ Conference Champ',
    description: 'Highest Net Score for the full season, including Conference Title Week.',
  },
  {
    key: 'bigGameBob',
    label: 'Big Game Bob Award',
    description: 'Most correct Bonus Team picks in the regular season.',
  },
  {
    key: 'steadyEddie',
    label: 'Steady Eddie Award',
    description:
      'Most weeks with the single highest score. Dependable excellence, week in and week out.',
  },
  {
    key: 'peytonSnub',
    label: 'Peyton Manning Snub',
    description: 'Best final rank among everyone who never had a highest-scoring week.',
    emptyNote: 'Everyone won at least one week',
  },
  {
    key: 'wellAlwaysHaveParis',
    label: "We'll Always Have Paris",
    description: 'Worst final rank among everyone who had at least one highest-scoring week.',
    emptyNote: 'Nobody with a weekly win finished outside the top spot',
  },
  {
    key: 'tateForcier',
    label: 'Tate Forcier September Heisman',
    description:
      "Biggest gap between a player's first-half average score and their own season-long average. Who came out hot before fading. Players who stopped participating partway through a season are left out of this one.",
  },
  {
    key: 'cardaleJonesCloser',
    label: 'Cardale Jones Closer',
    description:
      "Biggest gap between a player's second-half average score and their own season-long average. Who started slow and got hot late. Players who stopped participating partway through a season are left out of this one too.",
  },
  {
    key: 'piratesCode',
    label: "Pirate's Code",
    description: 'Most weeks correctly picking the actual highest-scoring team.',
  },
]

function YearRow({ year, winners, note }: { year: string; winners: Winner[] | null; note?: string }) {
  if (winners === null) {
    return (
      <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="text-muted-foreground">{year}</span>
        <span className="text-xs text-muted-foreground">Not tracked this season</span>
      </div>
    )
  }
  if (winners.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="text-muted-foreground">{year}</span>
        <span className="text-xs text-muted-foreground">{note ?? 'No qualifier this season'}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{year}</span>
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
          The full trophy case, one award at a time. Some awards weren&apos;t tracked in
          every year&apos;s source data, so those years are marked instead of guessed at.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {AWARD_DEFS.map((def) => (
          <Card key={def.key}>
            <CardHeader>
              <CardTitle className="text-base font-medium">{def.label}</CardTitle>
              <p className="text-sm text-muted-foreground">{def.description}</p>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {allSeasonAwards.map((a) => (
                <YearRow
                  key={a.label}
                  year={a.label}
                  winners={a[def.key]}
                  note={def.emptyNote}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
SCRIPT_EOF

echo "Awards page written."
