#!/bin/bash
set -e

mkdir -p "src/app/stats"
cat > "src/app/stats/page.tsx" << 'SCRIPT_EOF'
import Link from 'next/link'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const STATS_PAGES = [
  {
    href: '/season',
    title: 'Current Season',
    description: 'Standings, Win the Week, Bonus Team History, and Similarities.',
  },
  {
    href: '/history',
    title: 'League History',
    description: 'Final standings and Bonus Team picks from every season since 2019.',
  },
  {
    href: '/stats/pick-trends',
    title: 'Pick Trends',
    description: 'The most popular Bonus Team and Highest Scoring Team picks league-wide, and how often they paid off.',
  },
  {
    href: '/stats/streaks',
    title: 'Iron Man',
    description: 'Longest streaks of consecutive weeks with a submitted pick, across seasons.',
  },
  {
    href: '/stats/consistency',
    title: 'Consistency',
    description: 'Who performs closest to the field every week, and who swings hardest from boom to bust.',
  },
  {
    href: '/stats/season-swings',
    title: 'Breakout & Letdown Seasons',
    description: "The seasons where someone most exceeded, or most fell short of, their own career norm.",
  },
  {
    href: '/stats/rivalries',
    title: 'Head-to-Head Rivalries',
    description: 'Pick any two participants and see their week-by-week series, plus the most lopsided and most even rivalries in the league.',
  },
]

export default function StatsHubPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 py-12">
      <h1 className="text-2xl font-semibold">Stats</h1>

      {STATS_PAGES.map((stat) => (
        // Card is the actual flex child (a plain div) — the clickable
        // Link lives inside it as an invisible full-cover overlay instead
        // of wrapping it, so an <a> tag never has to be a flex item.
        // Safari has long-standing bugs sizing anchors as flex children;
        // four rounds of className patches on a Link-wraps-Card structure
        // (confirmed via live DevTools computed-width inspection) never
        // resolved it, which is what this restructure is working around.
        <Card key={stat.href} className="relative w-full transition-colors hover:bg-accent">
          <Link href={stat.href} className="absolute inset-0" aria-label={stat.title} />
          <CardHeader>
            <CardTitle className="text-base font-medium">{stat.title}</CardTitle>
            <CardDescription>{stat.description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

SCRIPT_EOF

mkdir -p "src/app/stats/pick-trends"
cat > "src/app/stats/pick-trends/page.tsx" << 'SCRIPT_EOF'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type PickRow = {
  team_picked: string | null
  was_correct: boolean | null
}

type TeamStat = {
  displayName: string
  count: number
  correct: number
}

// Historical entry preserved a mix of casing for the same team (e.g.
// "Ohio State" / "Ohio state" / "ohio state") -- group case-insensitively
// so counts aren't silently split across variants, but keep whichever
// actual casing appeared most often as the display name. A blind
// initcap() would mangle acronym schools (BYU, TCU, SMU, USC, UCLA)
// into "Byu", "Tcu", etc., so this preserves real casing instead.
function aggregateTeamPicks(rows: PickRow[]): TeamStat[] {
  const byNormalized = new Map<string, { casingCounts: Map<string, number>; count: number; correct: number }>()

  for (const r of rows) {
    if (!r.team_picked) continue
    const key = r.team_picked.toLowerCase()
    if (!byNormalized.has(key)) {
      byNormalized.set(key, { casingCounts: new Map(), count: 0, correct: 0 })
    }
    const entry = byNormalized.get(key)!
    entry.casingCounts.set(r.team_picked, (entry.casingCounts.get(r.team_picked) ?? 0) + 1)
    entry.count += 1
    if (r.was_correct) entry.correct += 1
  }

  const stats: TeamStat[] = []
  for (const entry of byNormalized.values()) {
    let bestCasing = ''
    let bestCount = -1
    for (const [casing, n] of entry.casingCounts) {
      if (n > bestCount) {
        bestCasing = casing
        bestCount = n
      }
    }
    stats.push({ displayName: bestCasing, count: entry.count, correct: entry.correct })
  }

  return stats.sort((a, b) => b.count - a.count)
}

async function fetchAllRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'historical_dn_picks' | 'historical_hst_picks'
): Promise<PickRow[]> {
  const rows: PickRow[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('team_picked, was_correct')
      .eq('is_conference_title', false)
      .range(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    rows.push(...(data as PickRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

function TeamLeaderboard({ stats }: { stats: TeamStat[] }) {
  const top = stats.slice(0, 15)
  return (
    <div className="flex flex-col divide-y divide-border">
      {top.map((t, i) => {
        const rate = t.count > 0 ? Math.round((t.correct / t.count) * 100) : 0
        return (
          <div key={t.displayName} className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="text-muted-foreground">
              {i + 1}. {t.displayName}
            </span>
            <span className="font-medium">
              {t.count} picks
              <span className="ml-1.5 text-xs text-muted-foreground">({rate}% correct)</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default async function PickTrendsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [dnRows, hstRows] = await Promise.all([
    fetchAllRows(supabase, 'historical_dn_picks'),
    fetchAllRows(supabase, 'historical_hst_picks'),
  ])

  const dnStats = aggregateTeamPicks(dnRows)
  const hstStats = aggregateTeamPicks(hstRows)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Pick Trends</h1>
        <p className="text-sm text-muted-foreground">
          The most popular Bonus Team and Highest Scoring Team picks across every season since
          2020, and how often they actually paid off.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Bonus Team Picks</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamLeaderboard stats={dnStats} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Highest Scoring Team Picks</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamLeaderboard stats={hstStats} />
        </CardContent>
      </Card>
    </div>
  )
}

SCRIPT_EOF

mkdir -p "src/app/stats/streaks"
cat > "src/app/stats/streaks/page.tsx" << 'SCRIPT_EOF'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
} from '@/components/ui/card'

type SeasonRow = { year: number; weeks_played: number }
type WeeklyRow = { year: number; historical_player_id: string; week_number: number; score: number }
type PlayerRow = { id: string; canonical_name: string }

type StreakResult = {
  playerId: string
  name: string
  length: number
  startYear: number
  startWeek: number
  endYear: number
  endWeek: number
}

async function fetchAllWeeklyScores(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<WeeklyRow[]> {
  const rows: WeeklyRow[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('historical_weekly_scores')
      .select('year, historical_player_id, week_number, score')
      .range(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    rows.push(
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
  return rows
}

// Longest run of consecutive chronological week-slots (spanning seasons)
// where a player had a nonzero score -- a missed pick scores zero by
// league rule, so "never got a zero" is the closest real signal we have
// for "never missed a week." A player with no row at all for a slot (a
// season they weren't in the league yet, or left) also breaks the streak,
// same as a genuine miss.
function computeLongestStreaks(
  seasons: SeasonRow[],
  players: PlayerRow[],
  weeklyScores: WeeklyRow[]
): StreakResult[] {
  const slots: { year: number; week: number }[] = []
  for (const s of seasons) {
    for (let w = 1; w <= s.weeks_played; w++) {
      slots.push({ year: s.year, week: w })
    }
  }

  const scoreByKey = new Map<string, number>()
  for (const w of weeklyScores) {
    scoreByKey.set(`${w.historical_player_id}:${w.year}:${w.week_number}`, w.score)
  }

  const results: StreakResult[] = []

  for (const p of players) {
    let bestLen = 0
    let bestStart = -1
    let bestEnd = -1
    let curLen = 0
    let curStart = -1

    for (let i = 0; i < slots.length; i++) {
      const { year, week } = slots[i]
      const score = scoreByKey.get(`${p.id}:${year}:${week}`)
      const submitted = score !== undefined && score !== 0

      if (submitted) {
        if (curLen === 0) curStart = i
        curLen++
        if (curLen > bestLen) {
          bestLen = curLen
          bestStart = curStart
          bestEnd = i
        }
      } else {
        curLen = 0
      }
    }

    if (bestLen > 0) {
      results.push({
        playerId: p.id,
        name: p.canonical_name,
        length: bestLen,
        startYear: slots[bestStart].year,
        startWeek: slots[bestStart].week,
        endYear: slots[bestEnd].year,
        endWeek: slots[bestEnd].week,
      })
    }
  }

  return results.sort((a, b) => b.length - a.length)
}

export default async function IronManPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: seasonsData }, { data: playersData }, weeklyScores] = await Promise.all([
    supabase.from('historical_seasons').select('year, weeks_played').order('year', { ascending: true }),
    supabase.from('historical_players').select('id, canonical_name'),
    fetchAllWeeklyScores(supabase),
  ])

  const seasons = (seasonsData ?? []) as SeasonRow[]
  const players = (playersData ?? []) as PlayerRow[]

  const streaks = computeLongestStreaks(seasons, players, weeklyScores).slice(0, 15)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Iron Man</h1>
        <p className="text-sm text-muted-foreground">
          Longest streak of consecutive weeks with a submitted pick, spanning seasons since
          2019. Conference Title Week isn&apos;t included, since it&apos;s scored differently.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y divide-border pt-6">
          {streaks.map((s, i) => (
            <div key={s.playerId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="text-muted-foreground">
                {i + 1}. {s.name}
              </span>
              <span className="text-right font-medium">
                {s.length} weeks
                <span className="ml-1.5 block text-xs font-normal text-muted-foreground sm:inline sm:ml-1.5">
                  ({s.startYear} Wk {s.startWeek} – {s.endYear} Wk {s.endWeek})
                </span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

SCRIPT_EOF

mkdir -p "src/app/stats/consistency"
cat > "src/app/stats/consistency/page.tsx" << 'SCRIPT_EOF'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type WeeklyRow = { year: number; historical_player_id: string; week_number: number; score: number }
type PlayerRow = { id: string; canonical_name: string }

type ConsistencyResult = {
  playerId: string
  name: string
  weeksPlayed: number
  stdDevPct: number
}

async function fetchAllWeeklyScores(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<WeeklyRow[]> {
  const rows: WeeklyRow[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('historical_weekly_scores')
      .select('year, historical_player_id, week_number, score')
      .range(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    rows.push(
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
  return rows
}

// Each week's field average is computed from real (nonzero) scores only,
// so a few missed picks that week don't drag the baseline down for
// everyone who did play. Every player's score that week is then expressed
// as a ratio to that baseline before computing variance -- this is what
// makes a Core Four week (24 games) comparable to a normal week (20-21
// games): the ratio cancels out the era's raw point scale, so only
// relative performance against that week's actual field matters.
function computeConsistency(weeklyScores: WeeklyRow[], players: PlayerRow[]): ConsistencyResult[] {
  const scoresBySlot = new Map<string, number[]>()
  for (const w of weeklyScores) {
    if (w.score === 0) continue
    const key = `${w.year}:${w.week_number}`
    if (!scoresBySlot.has(key)) scoresBySlot.set(key, [])
    scoresBySlot.get(key)!.push(w.score)
  }

  const fieldAvgBySlot = new Map<string, number>()
  for (const [key, scores] of scoresBySlot) {
    fieldAvgBySlot.set(key, scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  const ratiosByPlayer = new Map<string, number[]>()
  for (const w of weeklyScores) {
    if (w.score === 0) continue
    const fieldAvg = fieldAvgBySlot.get(`${w.year}:${w.week_number}`)
    if (!fieldAvg) continue
    if (!ratiosByPlayer.has(w.historical_player_id)) ratiosByPlayer.set(w.historical_player_id, [])
    ratiosByPlayer.get(w.historical_player_id)!.push(w.score / fieldAvg)
  }

  const results: ConsistencyResult[] = []
  for (const p of players) {
    const ratios = ratiosByPlayer.get(p.id)
    if (!ratios || ratios.length === 0) continue
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
    const variance = ratios.reduce((a, r) => a + (r - mean) ** 2, 0) / ratios.length
    const stdDevPct = Math.sqrt(variance) * 100
    results.push({
      playerId: p.id,
      name: p.canonical_name,
      weeksPlayed: ratios.length,
      stdDevPct,
    })
  }

  return results
}

function ConsistencyLeaderboard({ results }: { results: ConsistencyResult[] }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {results.map((r, i) => (
        <div key={r.playerId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
          <span className="text-muted-foreground">
            {i + 1}. {r.name}
          </span>
          <span className="font-medium">
            ±{r.stdDevPct.toFixed(1)}%
            <span className="ml-1.5 text-xs text-muted-foreground">({r.weeksPlayed} weeks)</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export default async function ConsistencyPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: playersData }, weeklyScores] = await Promise.all([
    supabase.from('historical_players').select('id, canonical_name'),
    fetchAllWeeklyScores(supabase),
  ])

  const players = (playersData ?? []) as PlayerRow[]
  const allResults = computeConsistency(weeklyScores, players)

  const mostConsistent = [...allResults].sort((a, b) => a.stdDevPct - b.stdDevPct).slice(0, 15)
  const boomOrBust = [...allResults].sort((a, b) => b.stdDevPct - a.stdDevPct).slice(0, 15)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Consistency</h1>
        <p className="text-sm text-muted-foreground">
          Every real week is measured against that week&apos;s field average, so eras with
          different game counts compare fairly. The percentage is how far a player&apos;s
          score typically swings from that baseline, on average.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Most Consistent</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsistencyLeaderboard results={mostConsistent} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Boom or Bust</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsistencyLeaderboard results={boomOrBust} />
        </CardContent>
      </Card>
    </div>
  )
}

SCRIPT_EOF

mkdir -p "src/app/stats/season-swings"
cat > "src/app/stats/season-swings/page.tsx" << 'SCRIPT_EOF'
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
  rank: number
  historical_players: { id: string; canonical_name: string } | null
}

type SeasonDeviation = {
  playerId: string
  name: string
  year: number
  percentile: number
  baseline: number
  deviation: number
}

export default async function SeasonSwingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: standingsData } = await supabase
    .from('historical_standings')
    .select('year, rank, historical_players(id, canonical_name)')

  const standings = (standingsData ?? []) as unknown as StandingRow[]

  // Percentile finish, same formula as the Career Stats page: 100th = won
  // the season, 0th = last place, scaled to that season's participant
  // count. Raw net score isn't comparable across eras (Core Four seasons
  // had 24 games/week vs 20-21 elsewhere), so percentile is the only fair
  // way to compare a season against a player's own career.
  const participantsByYear = new Map<number, number>()
  for (const s of standings) {
    participantsByYear.set(s.year, (participantsByYear.get(s.year) ?? 0) + 1)
  }

  type PlayerSeason = { playerId: string; name: string; year: number; percentile: number }
  const playerSeasons: PlayerSeason[] = []
  for (const s of standings) {
    const p = s.historical_players
    if (!p) continue
    const n = participantsByYear.get(s.year) ?? 1
    const percentile = n > 1 ? 1 - (s.rank - 1) / (n - 1) : 1
    playerSeasons.push({ playerId: p.id, name: p.canonical_name, year: s.year, percentile })
  }

  const seasonsByPlayer = new Map<string, PlayerSeason[]>()
  for (const ps of playerSeasons) {
    if (!seasonsByPlayer.has(ps.playerId)) seasonsByPlayer.set(ps.playerId, [])
    seasonsByPlayer.get(ps.playerId)!.push(ps)
  }

  // Each season is compared against the average of that player's OTHER
  // seasons (leave-one-out), not including itself -- otherwise a genuine
  // outlier season would drag its own baseline toward itself and understate
  // how unusual it really was, especially for players with few seasons
  // played.
  const deviations: SeasonDeviation[] = []
  for (const seasons of seasonsByPlayer.values()) {
    if (seasons.length < 2) continue
    for (const target of seasons) {
      const others = seasons.filter((s) => s.year !== target.year)
      const baseline = others.reduce((a, s) => a + s.percentile, 0) / others.length
      deviations.push({
        playerId: target.playerId,
        name: target.name,
        year: target.year,
        percentile: target.percentile,
        baseline,
        deviation: target.percentile - baseline,
      })
    }
  }

  const breakouts = [...deviations].sort((a, b) => b.deviation - a.deviation).slice(0, 15)
  const letdowns = [...deviations].sort((a, b) => a.deviation - b.deviation).slice(0, 15)

  const Row = ({ d }: { d: SeasonDeviation }) => (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">
        {d.name} <span className="text-xs">({d.year})</span>
      </span>
      <span className="font-medium">
        {d.deviation > 0 ? '+' : ''}
        {Math.round(d.deviation * 100)} pts
        <span className="ml-1.5 text-xs text-muted-foreground">
          {Math.round(d.percentile * 100)}th vs. usual {Math.round(d.baseline * 100)}th
        </span>
      </span>
    </div>
  )

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Breakout &amp; Letdown Seasons</h1>
        <p className="text-sm text-muted-foreground">
          Every season measured against that player&apos;s own percentile finish in every
          other season they&apos;ve played. The biggest swings, in either direction.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Breakout Seasons</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {breakouts.map((d) => (
            <Row key={`${d.playerId}-${d.year}`} d={d} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Letdown Seasons</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {letdowns.map((d) => (
            <Row key={`${d.playerId}-${d.year}`} d={d} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

SCRIPT_EOF

mkdir -p "src/app/stats/rivalries"
cat > "src/app/stats/rivalries/page.tsx" << 'SCRIPT_EOF'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import RivalryPicker from '@/components/RivalryPicker'

type WeeklyRow = { year: number; historical_player_id: string; week_number: number; score: number }
type PlayerRow = { id: string; canonical_name: string }
type PairRecord = { aWins: number; bWins: number; ties: number; games: number }

// Only counted when the shared threshold below is met. Below that, one or
// two lucky weeks can look like a "rivalry" even though it isn't a real
// sample -- confirmed against real data that all but 35 of 435 possible
// pairs clear 20 shared weeks, so this excludes only the genuine outliers.
const MIN_GAMES_FOR_LEADERBOARD = 20
const LEADERBOARD_SIZE = 10

async function fetchAllWeeklyScores(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<WeeklyRow[]> {
  const rows: WeeklyRow[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('historical_weekly_scores')
      .select('year, historical_player_id, week_number, score')
      .range(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    rows.push(
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
  return rows
}

export default async function RivalriesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: playersData }, weeklyScores] = await Promise.all([
    supabase.from('historical_players').select('id, canonical_name'),
    fetchAllWeeklyScores(supabase),
  ])

  const players = (playersData ?? []) as PlayerRow[]

  // Only real (nonzero) weeks count as a "game" in the series -- a week
  // where one person missed picks and the other didn't isn't a real
  // head-to-head, just one person showing up.
  const scoreByPlayerSlot = new Map<string, Map<string, number>>()
  for (const w of weeklyScores) {
    if (w.score === 0) continue
    const slot = `${w.year}:${w.week_number}`
    if (!scoreByPlayerSlot.has(slot)) scoreByPlayerSlot.set(slot, new Map())
    scoreByPlayerSlot.get(slot)!.set(w.historical_player_id, w.score)
  }

  const records = new Map<string, PairRecord>()
  const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`)

  for (const slotScores of scoreByPlayerSlot.values()) {
    const entries = [...slotScores.entries()]
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, scoreA] = entries[i]
        const [idB, scoreB] = entries[j]
        const key = pairKey(idA, idB)
        if (!records.has(key)) records.set(key, { aWins: 0, bWins: 0, ties: 0, games: 0 })
        const rec = records.get(key)!
        rec.games += 1
        // Record is always stored with the alphabetically-first id as "a",
        // matching pairKey's ordering, regardless of iteration order here.
        const aIsFirst = idA < idB
        const firstScore = aIsFirst ? scoreA : scoreB
        const secondScore = aIsFirst ? scoreB : scoreA
        if (firstScore > secondScore) rec.aWins += 1
        else if (secondScore > firstScore) rec.bWins += 1
        else rec.ties += 1
      }
    }
  }

  const nameById = new Map(players.map((p) => [p.id, p.canonical_name]))
  const qualifying = [...records.entries()]
    .filter(([, rec]) => rec.games >= MIN_GAMES_FOR_LEADERBOARD)
    .map(([key, rec]) => {
      const [idA, idB] = key.split(':')
      return {
        nameA: nameById.get(idA) ?? 'Unknown',
        nameB: nameById.get(idB) ?? 'Unknown',
        ...rec,
        lopsidedness: Math.abs(rec.aWins - rec.bWins) / rec.games,
      }
    })

  const mostLopsided = [...qualifying].sort((a, b) => {
    if (b.lopsidedness !== a.lopsidedness) return b.lopsidedness - a.lopsidedness
    return b.games - a.games
  }).slice(0, LEADERBOARD_SIZE)
  const mostEven = [...qualifying].sort((a, b) => {
    if (a.lopsidedness !== b.lopsidedness) return a.lopsidedness - b.lopsidedness
    return b.games - a.games
  }).slice(0, LEADERBOARD_SIZE)

  const recordsObj: Record<string, PairRecord> = Object.fromEntries(records)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Head-to-Head Rivalries</h1>
        <p className="text-sm text-muted-foreground">
          Every week both people submitted a real pick counts as a game. Whoever scored
          higher that week wins it, and matching scores are a tie.
        </p>
      </div>

      <RivalryPicker
        players={players.map((p) => ({ id: p.id, name: p.canonical_name }))}
        records={recordsObj}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Most Lopsided Rivalries</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {mostLopsided.map((r, i) => (
            <div key={`${r.nameA}-${r.nameB}`} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="text-muted-foreground">
                {i + 1}. {r.aWins > r.bWins ? r.nameA : r.nameB} over{' '}
                {r.aWins > r.bWins ? r.nameB : r.nameA}
              </span>
              <span className="font-medium">
                {Math.max(r.aWins, r.bWins)}–{Math.min(r.aWins, r.bWins)}
                {r.ties > 0 ? `–${r.ties}` : ''}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Most Even Rivalries</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {mostEven.map((r, i) => (
            <div key={`${r.nameA}-${r.nameB}`} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="text-muted-foreground">
                {i + 1}. {r.nameA} vs. {r.nameB}
              </span>
              <span className="font-medium">
                {r.aWins}–{r.bWins}
                {r.ties > 0 ? `–${r.ties}` : ''}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

SCRIPT_EOF

mkdir -p "src/components"
cat > "src/components/RivalryPicker.tsx" << 'SCRIPT_EOF'
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type PlayerOption = { id: string; name: string }
type RivalryRecord = { aWins: number; bWins: number; ties: number; games: number }

export default function RivalryPicker({
  players,
  records,
}: {
  players: PlayerOption[]
  records: Record<string, RivalryRecord>
}) {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name))
  const [playerAId, setPlayerAId] = useState(sorted[0]?.id ?? '')
  const [playerBId, setPlayerBId] = useState(sorted[1]?.id ?? '')

  const nameById = new Map(players.map((p) => [p.id, p.name]))

  let display: { aName: string; bName: string; aWins: number; bWins: number; ties: number; games: number } | null =
    null

  if (playerAId && playerBId && playerAId !== playerBId) {
    const key = playerAId < playerBId ? `${playerAId}:${playerBId}` : `${playerBId}:${playerAId}`
    const rec = records[key]
    const flip = playerAId > playerBId
    display = {
      aName: nameById.get(playerAId) ?? '',
      bName: nameById.get(playerBId) ?? '',
      aWins: rec ? (flip ? rec.bWins : rec.aWins) : 0,
      bWins: rec ? (flip ? rec.aWins : rec.bWins) : 0,
      ties: rec?.ties ?? 0,
      games: rec?.games ?? 0,
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Look Up a Rivalry</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <select
            value={playerAId}
            onChange={(e) => setPlayerAId(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">vs.</span>
          <select
            value={playerBId}
            onChange={(e) => setPlayerBId(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {playerAId === playerBId ? (
          <p className="text-sm text-muted-foreground">Pick two different people.</p>
        ) : display && display.games === 0 ? (
          <p className="text-sm text-muted-foreground">
            {display.aName} and {display.bName} have never both submitted a pick in the same
            week.
          </p>
        ) : display ? (
          <div className="flex flex-col items-center gap-1 py-2 text-center">
            <span className="text-2xl font-semibold">
              {display.aWins} – {display.bWins}
              {display.ties > 0 ? ` – ${display.ties}` : ''}
            </span>
            <span className="text-xs text-muted-foreground">
              {display.aName} vs. {display.bName} · {display.games} shared week
              {display.games === 1 ? '' : 's'}
              {display.ties > 0 ? ` (${display.ties} tied)` : ''}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

SCRIPT_EOF

echo "All new Stats pages written."
