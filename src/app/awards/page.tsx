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
  isLive: boolean
  regSeasonChamp: Winner[]
  confChamp: Winner[]
  bigGameBob: Winner[] | null // null = not tracked this season
  caseKeenum: Winner[]
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

// ---------- Historical (2019-2025) computation ----------

type HistStandingRow = {
  year: number
  net_score: number
  rank: number
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

function computeHistoricalAwards(
  season: HistSeasonRow,
  standings: HistStandingRow[],
  weeklyScores: HistWeeklyRow[],
  dnCorrectByPlayer: Map<string, number>,
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
    firstHalfSum: number
    secondHalfSum: number
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

  const firstHalfCount = Math.ceil(season.weeks_played / 2)

  const players: Player[] = standings.map((s) => {
    const weeks = weeksByPlayer.get(s.historical_player_id) ?? []
    const firstHalfSum = weeks.slice(0, firstHalfCount).reduce((a, b) => a + (b ?? 0), 0)
    const secondHalfSum = weeks.slice(firstHalfCount).reduce((a, b) => a + (b ?? 0), 0)
    return {
      playerId: s.historical_player_id,
      name: s.historical_players?.canonical_name ?? 'Unknown',
      userId: s.historical_players?.user_id ?? null,
      rank: s.rank,
      netScore: s.net_score,
      hstCorrect: s.hst_correct_count,
      dnCorrect: dnCorrectByPlayer.get(s.historical_player_id) ?? 0,
      weeksWon: weeksWonByPlayer.get(s.historical_player_id) ?? 0,
      firstHalfSum,
      secondHalfSum,
    }
  })

  const toWinners = (ps: Player[], value: (p: Player) => number): Winner[] =>
    ps.map((p) => ({ name: p.name, userId: p.userId, value: value(p) }))

  const confChampPlayers = pickWinners(players, (p) => -p.rank, 'max') // rank 1 wins
  const bigGameBobPlayers = dnTrackedThisYear
    ? pickWinners(players, (p) => p.dnCorrect, 'max')
    : null
  const caseKeenumPlayers = pickWinners(players, (p) => p.weeksWon, 'max')
  const zeroWeekPlayers = players.filter((p) => p.weeksWon === 0)
  const peytonSnubPlayers = pickWinners(zeroWeekPlayers, (p) => -p.rank, 'max')
  const wonAtLeastOneWeek = players.filter((p) => p.weeksWon >= 1)
  const parisPlayers = pickWinners(wonAtLeastOneWeek, (p) => p.rank, 'max')
  const forcierPlayers = pickWinners(players, (p) => p.firstHalfSum, 'max')
  const cardalePlayers = pickWinners(players, (p) => p.secondHalfSum, 'max')
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
    isLive: false,
    regSeasonChamp: [], // filled by caller (needs conf_title_score, not passed here)
    confChamp: toWinners(confChampPlayers, (p) => p.netScore),
    bigGameBob: bigGameBobPlayers ? toWinners(bigGameBobPlayers, (p) => p.dnCorrect) : null,
    caseKeenum: toWinners(caseKeenumPlayers, (p) => p.weeksWon),
    peytonSnub: toWinners(peytonSnubPlayers, (p) => p.rank),
    wellAlwaysHaveParis: toWinners(parisPlayers, (p) => p.rank),
    tateForcier: toWinners(forcierPlayers, (p) => p.firstHalfSum),
    cardaleJonesCloser: toWinners(cardalePlayers, (p) => p.secondHalfSum),
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

  const [
    { data: seasonsData },
    { data: standingsData },
    { data: weeklyData },
    { data: dnData },
  ] = await Promise.all([
    supabase.from('historical_seasons').select('year, weeks_played, had_conference_title').order('year', { ascending: false }),
    supabase
      .from('historical_standings')
      .select(
        'year, team_name, net_score, rank, tiebreaker_avg, conf_title_score, hst_correct_count, historical_player_id, historical_players(canonical_name, user_id)'
      ),
    supabase.from('historical_weekly_scores').select('year, historical_player_id, week_number, score'),
    supabase
      .from('historical_dn_picks')
      .select('year, historical_player_id, was_correct')
      .eq('is_conference_title', false)
      .eq('was_correct', true),
  ])

  const seasons = (seasonsData ?? []) as HistSeasonRow[]
  const standings = (standingsData ?? []) as unknown as (HistStandingRow & {
    team_name: string | null
    conf_title_score: number | null
  })[]
  const weeklyScores = (weeklyData ?? []) as HistWeeklyRow[]
  const dnCorrect = (dnData ?? []) as { year: number; historical_player_id: string }[]

  const dnCorrectByYear = new Map<number, Map<string, number>>()
  for (const d of dnCorrect) {
    if (!dnCorrectByYear.has(d.year)) dnCorrectByYear.set(d.year, new Map())
    const m = dnCorrectByYear.get(d.year)!
    m.set(d.historical_player_id, (m.get(d.historical_player_id) ?? 0) + 1)
  }

  const dnTrackedYears = new Set(dnCorrect.map((d) => d.year))
  // A year with zero correct D/N picks anywhere would incorrectly look
  // "untracked" using dnCorrect alone -- check against the picks table too.
  const { data: dnAnyPicks } = await supabase.from('historical_dn_picks').select('year').eq('is_conference_title', false)
  for (const r of dnAnyPicks ?? []) dnTrackedYears.add((r as { year: number }).year)

  const allSeasonAwards: SeasonAwards[] = seasons.map((season) => {
    const yearStandings = standings.filter((s) => s.year === season.year)
    const yearWeekly = weeklyScores.filter((w) => w.year === season.year)
    const dnByPlayer = dnCorrectByYear.get(season.year) ?? new Map()

    const awards = computeHistoricalAwards(
      season,
      yearStandings,
      yearWeekly,
      dnByPlayer,
      dnTrackedYears.has(season.year)
    )

    // Regular Season Champion: sum of weeks minus lowest week (same rule
    // as /history), computed here too so it can sit in the same trophy case.
    const weeksByPlayer = new Map<string, number[]>()
    for (const w of yearWeekly) {
      if (!weeksByPlayer.has(w.historical_player_id)) weeksByPlayer.set(w.historical_player_id, [])
      weeksByPlayer.get(w.historical_player_id)!.push(w.score)
    }
    let bestRegNet = -Infinity
    let regChamps: { historical_player_id: string; name: string; userId: string | null }[] = []
    for (const s of yearStandings) {
      const scores = weeksByPlayer.get(s.historical_player_id)
      if (!scores || scores.length === 0) continue
      const regNet = scores.reduce((a, b) => a + b, 0) - Math.min(...scores)
      if (regNet > bestRegNet) {
        bestRegNet = regNet
        regChamps = [
          {
            historical_player_id: s.historical_player_id,
            name: s.historical_players?.canonical_name ?? 'Unknown',
            userId: s.historical_players?.user_id ?? null,
          },
        ]
      } else if (regNet === bestRegNet) {
        regChamps.push({
          historical_player_id: s.historical_player_id,
          name: s.historical_players?.canonical_name ?? 'Unknown',
          userId: s.historical_players?.user_id ?? null,
        })
      }
    }
    awards.regSeasonChamp = regChamps.map((c) => ({ name: c.name, userId: c.userId, value: bestRegNet }))

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
              <WinnerLine label="Case Keenum Stat Line" winners={a.caseKeenum} />
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
        Big Game Bob Award: most correct Bonus Team picks. Case Keenum Stat Line: most weeks
        with the single highest score. Peyton Manning Snub: best final rank among everyone who
        never had a highest-scoring week. We&apos;ll Always Have Paris: worst final rank among
        everyone who had at least one highest-scoring week. Tate Forcier / Cardale Jones Closer:
        highest total score across the first vs. second half of the season&apos;s weeks (split
        at the season&apos;s midpoint, conference title week excluded). Pirate&apos;s Code: most
        weeks correctly picking the actual highest-scoring team. Bonus Team wasn&apos;t part of
        the rules until 2020; Highest Scoring Team correctness wasn&apos;t tracked in the source
        data until 2023 — both show as not tracked for earlier seasons rather than a guessed
        value.
      </p>
    </div>
  )
}
