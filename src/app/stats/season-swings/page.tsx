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

