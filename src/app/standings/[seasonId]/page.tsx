import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type SeasonStanding = {
  user_id: string
  display_name: string
  weeks_completed: number
  gross_score: number
  dropped_week_id: string | null
  dropped_week_name: string | null
  dropped_week_score: number | null
  net_score: number
  weeks_won: number
  tiebreaker_avg: number | null
}

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ seasonId: string }>
}) {
  const { seasonId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('id', seasonId)
    .maybeSingle()

  if (!season) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 p-4 py-12">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">Season Not Found</h1>
      </div>
    )
  }

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

  const weekRawScores = new Map<string, Map<string, number>>()
  for (const w of completedWeeks ?? []) {
    const { data: weekData } = await supabase.rpc('get_week_standings', {
      p_week_id: w.id,
    })
    const scoreMap = new Map<string, number>()
    for (const row of weekData ?? []) {
      scoreMap.set(row.user_id, row.raw_score)
    }
    weekRawScores.set(w.id, scoreMap)
  }

  const sorted = standings.slice().sort((a, b) => {
    if (b.net_score !== a.net_score) return b.net_score - a.net_score
    if (b.gross_score !== a.gross_score) return b.gross_score - a.gross_score
    return a.display_name.localeCompare(b.display_name)
  })

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{season.name} Standings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Season Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed weeks yet — standings will appear once the commissioner marks a week
              complete.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium">
                      Participant
                    </th>
                    <th className="px-2 py-2 text-right font-medium">Net</th>
                    <th className="px-2 py-2 text-right font-medium">Gross</th>
                    <th className="px-2 py-2 text-right font-medium">Wins</th>
                    <th className="px-2 py-2 text-right font-medium">Tiebreaker Avg</th>
                    <th className="min-w-[140px] px-2 py-2 text-left font-medium">
                      Dropped Week
                    </th>
                    {(completedWeeks ?? []).map((w) => (
                      <th key={w.id} className="px-2 py-2 text-right font-medium">
                        {w.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr key={row.user_id} className="border-b border-border last:border-0">
                      <td className="sticky left-0 z-10 bg-card px-2 py-2 font-medium">
                        {i === 0 && '🏆 '}
                        {row.display_name}
                        {row.user_id === user.id && (
                          <span className="text-muted-foreground"> (you)</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">{row.net_score}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">
                        {row.gross_score}
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground">
                        {row.weeks_won}
                      </td>
                      <td className="px-2 py-2 text-right text-muted-foreground">
                        {row.tiebreaker_avg != null ? row.tiebreaker_avg.toFixed(1) : '—'}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">
                        {row.dropped_week_name
                          ? `${row.dropped_week_name} (${row.dropped_week_score})`
                          : '—'}
                      </td>
                      {(completedWeeks ?? []).map((w) => (
                        <td key={w.id} className="px-2 py-2 text-right">
                          {weekRawScores.get(w.id)?.get(row.user_id) ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
