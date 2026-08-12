import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import StandingsExportTable from '@/components/StandingsExportTable'

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

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('id', seasonId)
    .maybeSingle()

  if (!season) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 p-4 py-12">
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
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

  // Plain nested object, not a Map — Maps aren't serializable across the
  // server/client component boundary, and this data needs to reach
  // StandingsExportTable (a client component) as props.
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
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{season.name} Standings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Season Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <StandingsExportTable
            seasonName={season.name}
            standings={standings}
            completedWeeks={completedWeeks ?? []}
            weekRawScores={weekRawScores}
            currentUserId={user.id}
            isCommissioner={profile?.role === 'commissioner'}
          />
        </CardContent>
      </Card>
    </div>
  )
}
