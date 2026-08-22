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

