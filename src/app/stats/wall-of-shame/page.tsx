import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

type Row = {
  year: number
  week: number
  opponent: string
  osu_score: number
  opponent_score: number
  historical_player_id: string
  historical_players: { canonical_name: string } | null
}

type Game = {
  year: number
  week: number
  opponent: string
  osuScore: number
  opponentScore: number
  pickers: string[]
}

export default async function WallOfShamePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data }, { data: allPlayersData }] = await Promise.all([
    supabase
      .from('osu_wall_of_shame')
      .select(
        'year, week, opponent, osu_score, opponent_score, historical_player_id, historical_players(canonical_name)'
      )
      .order('year', { ascending: true })
      .order('week', { ascending: true }),
    supabase.from('historical_players').select('id, canonical_name'),
  ])

  const rows = (data ?? []) as unknown as Row[]

  const shamedIds = new Set(rows.map((r) => r.historical_player_id))
  const allPlayers = (allPlayersData ?? []) as { id: string; canonical_name: string }[]
  const cleanRecord = allPlayers
    .filter((p) => !shamedIds.has(p.id))
    .map((p) => p.canonical_name)
    .sort((a, b) => a.localeCompare(b))

  const gamesByKey = new Map<string, Game>()
  const orderedKeys: string[] = []
  for (const r of rows) {
    const key = `${r.year}-${r.week}-${r.opponent}`
    if (!gamesByKey.has(key)) {
      gamesByKey.set(key, {
        year: r.year,
        week: r.week,
        opponent: r.opponent,
        osuScore: r.osu_score,
        opponentScore: r.opponent_score,
        pickers: [],
      })
      orderedKeys.push(key)
    }
    if (r.historical_players) gamesByKey.get(key)!.pickers.push(r.historical_players.canonical_name)
  }
  const games = orderedKeys.map((k) => gamesByKey.get(k)!)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Ohio State Wall of Shame</h1>
        <p className="text-sm text-muted-foreground">
          Every recorded pick against the family team, in order. A couple of these actually
          paid off, and they&apos;re still here.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y divide-border pt-6">
          {games.map((g) => {
            const osuLost = g.osuScore < g.opponentScore
            return (
              <div
                key={`${g.year}-${g.week}-${g.opponent}`}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {g.year} Wk {g.week} vs. {g.opponent}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {g.pickers.join(', ')}
                  </span>
                </div>
                <span className="text-right">
                  <span className="font-medium">
                    {g.osuScore}–{g.opponentScore}
                  </span>
                  {osuLost && (
                    <span className="block text-xs text-muted-foreground">
                      OSU lost this one
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Never once: {cleanRecord.join(', ')}.
      </p>
    </div>
  )
}
