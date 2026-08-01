import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function PickGridPage({
  params,
}: {
  params: Promise<{ weekId: string }>
}) {
  const { weekId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: week } = await supabase
    .from('weeks')
    .select('id, name, week_type, season_id')
    .eq('id', weekId)
    .maybeSingle()

  if (!week) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 p-4 py-12">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">Week Not Found</h1>
      </div>
    )
  }

  const { data: season } = await supabase
    .from('seasons')
    .select('name')
    .eq('id', week.season_id)
    .single()

  const isConferenceTitle = week.week_type === 'conference_title'

  const { data: games } = await supabase
    .from('games')
    .select('id, away_team, home_team, kickoff_time, game_of_week, status')
    .eq('week_id', weekId)
    .order('kickoff_time', { ascending: true })

  const { data: participants } = await supabase
    .from('users')
    .select('id, display_name')
    .order('display_name', { ascending: true })

  const gameIds = (games ?? []).map((g) => g.id)

  // Deliberately no .eq('user_id', ...) filter — RLS on `picks` decides row
  // visibility on its own: the viewer's own picks always come back, other
  // participants' picks only for games whose kickoff has already passed.
  const { data: picks } =
    gameIds.length > 0
      ? await supabase
          .from('picks')
          .select('user_id, game_id, picked_team, is_double_or_nothing, confidence_points')
          .in('game_id', gameIds)
      : { data: [] }

  const pickLookup = new Map((picks ?? []).map((p) => [`${p.user_id}:${p.game_id}`, p]))

  const now = Date.now()

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 py-12">
      <div>
        <Link
          href={`/picks/${weekId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← My Picks
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{season?.name}</h1>
        <p className="text-muted-foreground">
          {week.name}
          {isConferenceTitle && ' — Conference Title Week'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Pick Grid</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Picks reveal per game once that game&apos;s kickoff has passed. Your own picks are
            always visible to you; everyone else&apos;s stay hidden until then.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium">
                    Participant
                  </th>
                  {(games ?? []).map((g) => {
                    const locked = new Date(g.kickoff_time).getTime() <= now
                    const canceled = g.status === 'canceled'
                    return (
                      <th key={g.id} className="min-w-[110px] px-2 py-2 text-left font-medium">
                        <div className="flex flex-col gap-1">
                          <span className="whitespace-nowrap">
                            {g.away_team} @ {g.home_team}
                          </span>
                          <div className="flex gap-1">
                            {g.game_of_week && <Badge className="text-[10px]">GOTW</Badge>}
                            {canceled ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Canceled
                              </Badge>
                            ) : (
                              <Badge
                                variant={locked ? 'secondary' : 'outline'}
                                className="text-[10px]"
                              >
                                {locked ? 'Locked' : 'Open'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {(participants ?? []).map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="sticky left-0 z-10 bg-card px-2 py-2 font-medium">
                      {p.display_name}
                      {p.id === user.id && (
                        <span className="text-muted-foreground"> (you)</span>
                      )}
                    </td>
                    {(games ?? []).map((g) => {
                      const locked = new Date(g.kickoff_time).getTime() <= now
                      const pick = pickLookup.get(`${p.id}:${g.id}`)

                      return (
                        <td key={g.id} className="px-2 py-2">
                          {pick?.picked_team ? (
                            <div className="flex items-center gap-1">
                              <span>{pick.picked_team}</span>
                              {pick.is_double_or_nothing && (
                                <Badge variant="secondary" className="text-[10px]">
                                  2x
                                </Badge>
                              )}
                              {isConferenceTitle && pick.confidence_points != null && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {pick.confidence_points}
                                </Badge>
                              )}
                            </div>
                          ) : locked ? (
                            <span className="text-muted-foreground">No pick</span>
                          ) : (
                            <span className="text-muted-foreground">🔒</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
