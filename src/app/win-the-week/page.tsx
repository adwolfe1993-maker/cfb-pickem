import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Trophy } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type WeekStanding = {
  user_id: string
  display_name: string
  raw_score: number
  win_the_week: boolean
}

export default async function WinTheWeekPage() {
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
    .select('id, name, week_number')
    .eq('season_id', season.id)
    .eq('status', 'complete')
    .order('week_number')

  const weeksWithWinners = await Promise.all(
    (weeks ?? []).map(async (w) => {
      const { data: weekData } = await supabase.rpc('get_week_standings', {
        p_week_id: w.id,
      })
      const rows = (weekData ?? []) as WeekStanding[]
      const winners = rows.filter((r) => r.win_the_week)
      return { week: w, winners }
    })
  )

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Win the Week History</h1>
        <Link href="/stats" className="text-sm font-medium text-primary underline underline-offset-4">
          ← Stats
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        The highest weekly score earns a bonus point toward Net Score. Ties are broken by the
        Highest Scoring Team pick, then closest predicted Game of the Week combined score, then
        closest margin of victory — genuine co-winners share the week.
      </p>

      {weeksWithWinners.length === 0 ? (
        <p className="text-sm text-muted-foreground">No completed weeks yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {weeksWithWinners.map(({ week, winners }) => (
            <Card key={week.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{week.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {winners.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No winner recorded for this week.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {winners.map((wnr) => (
                      <li key={wnr.user_id} className="flex items-center gap-2 text-sm">
                        <Trophy size={16} className="text-accent" />
                        <span className="font-medium">{wnr.display_name}</span>
                        <span className="text-muted-foreground">
                          — {wnr.raw_score} points
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
