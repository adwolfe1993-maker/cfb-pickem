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

