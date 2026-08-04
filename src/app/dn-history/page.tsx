import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, XCircle, Circle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type DnPick = {
  picked_team: string
  week_name: string
  kickoff_time: string
  is_correct: boolean | null
}

export default async function DnHistoryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .limit(1)

  const season = seasons?.[0]

  if (!season) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 p-4 py-12">
        <h1 className="text-2xl font-semibold">No Active Season</h1>
        <p className="text-sm text-muted-foreground">
          Check back once the commissioner starts a season.
        </p>
      </div>
    )
  }

  const { data: weeks } = await supabase
    .from('weeks')
    .select('id, name')
    .eq('season_id', season.id)

  const weekIds = (weeks ?? []).map((w) => w.id)
  const weekNameById = new Map((weeks ?? []).map((w) => [w.id, w.name]))

  const { data: games } = weekIds.length
    ? await supabase
        .from('games')
        .select('id, week_id, kickoff_time')
        .in('week_id', weekIds)
        .lte('kickoff_time', new Date().toISOString())
    : { data: [] }

  const gameIds = (games ?? []).map((g) => g.id)
  const weekIdByGameId = new Map((games ?? []).map((g) => [g.id, g.week_id]))
  const kickoffByGameId = new Map((games ?? []).map((g) => [g.id, g.kickoff_time]))

  const { data: dnPicks } = gameIds.length
    ? await supabase
        .from('picks')
        .select('user_id, game_id, picked_team, is_correct')
        .eq('is_double_or_nothing', true)
        .in('game_id', gameIds)
    : { data: [] }

  const { data: allUsers } = await supabase
    .from('users')
    .select('id, display_name')
    .order('display_name')

  const historyByUser: Record<string, DnPick[]> = {}
  for (const p of dnPicks ?? []) {
    const weekId = weekIdByGameId.get(p.game_id)
    const weekName = weekId ? weekNameById.get(weekId) : undefined
    const kickoff = kickoffByGameId.get(p.game_id)
    if (!weekName || !kickoff) continue
    if (!historyByUser[p.user_id]) historyByUser[p.user_id] = []
    historyByUser[p.user_id].push({
      picked_team: p.picked_team,
      week_name: weekName,
      kickoff_time: kickoff,
      is_correct: p.is_correct,
    })
  }

  for (const uid of Object.keys(historyByUser)) {
    historyByUser[uid].sort(
      (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
    )
  }

  const participants = (allUsers ?? []).slice().sort((a, b) =>
    (a.display_name ?? '').localeCompare(b.display_name ?? '')
  )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Double or Nothing History</h1>
        <Link href="/stats" className="text-sm font-medium text-primary underline underline-offset-4">
          ← Stats
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Every team used as a Double or Nothing pick this season, revealed once that game&apos;s
        kickoff has passed. Each team can only be used once per season.
      </p>

      <div className="flex flex-col gap-3">
        {participants.map((p) => {
          const history = historyByUser[p.id] ?? []
          return (
            <Card key={p.id} className={p.id === user.id ? 'border-primary' : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {p.display_name}
                  {p.id === user.id && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No D/N picks revealed yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {history.map((h, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        {h.is_correct === true && (
                          <CheckCircle2 size={16} className="text-green-600" />
                        )}
                        {h.is_correct === false && (
                          <XCircle size={16} className="text-destructive" />
                        )}
                        {h.is_correct === null && (
                          <Circle size={16} className="text-muted-foreground" />
                        )}
                        <span className="font-medium">{h.picked_team}</span>
                        <span className="text-muted-foreground">— {h.week_name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
