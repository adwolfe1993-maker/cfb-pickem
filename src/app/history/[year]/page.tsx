import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type StandingRow = {
  team_name: string | null
  gross_total: number
  net_score: number
  rank: number
  tiebreaker_avg: number | null
  historical_players: { id: string; canonical_name: string; user_id: string | null } | null
}

type WtwRow = {
  week_number: number
  historical_players: { canonical_name: string; user_id: string | null } | null
}

const MEDALS: Record<number, string> = { 1: '🏆 ', 2: '🥈 ', 3: '🥉 ' }

export default async function HistorySeasonPage({
  params,
}: {
  params: Promise<{ year: string }>
}) {
  const { year: yearParam } = await params
  const year = parseInt(yearParam, 10)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!year) {
    notFound()
  }

  const { data: season } = await supabase
    .from('historical_seasons')
    .select('year, weeks_played, had_conference_title')
    .eq('year', year)
    .maybeSingle()

  if (!season) {
    notFound()
  }

  const { data: standingsData } = await supabase
    .from('historical_standings')
    .select(
      'team_name, gross_total, net_score, rank, tiebreaker_avg, historical_players(id, canonical_name, user_id)'
    )
    .eq('year', year)
    .order('rank', { ascending: true })

  const standings = (standingsData ?? []) as unknown as StandingRow[]

  const { data: wtwData } = await supabase
    .from('historical_win_the_week')
    .select('week_number, historical_players(canonical_name, user_id)')
    .eq('year', year)
    .order('week_number', { ascending: true })

  const wtw = (wtwData ?? []) as unknown as WtwRow[]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/history" className="text-sm text-muted-foreground hover:underline">
          ← League History
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{year} Final Standings</h1>
        <p className="text-sm text-muted-foreground">
          {season.weeks_played} week{season.weeks_played === 1 ? '' : 's'}
          {season.had_conference_title ? ' + Conference Title Week' : ' · no Conference Title Week'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Standings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-0 divide-y divide-border">
          {standings.map((s, i) => {
            const isYou = s.historical_players?.user_id === user.id
            return (
              <div
                key={s.historical_players?.id ?? i}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  <span className="text-muted-foreground">{MEDALS[s.rank] ?? `${s.rank}. `}</span>
                  {s.team_name ? (
                    <>
                      <span className="font-medium">{s.team_name}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        ({s.historical_players?.canonical_name})
                      </span>
                    </>
                  ) : (
                    <span className="font-medium">{s.historical_players?.canonical_name}</span>
                  )}
                  {isYou && <span className="text-muted-foreground"> (you)</span>}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold">{s.net_score}</span>
                  <span className="text-xs text-muted-foreground">/{s.gross_total} gross</span>
                </span>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {wtw.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Win the Week</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-0 divide-y divide-border">
            {wtw.map((w, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-muted-foreground">Week {w.week_number}</span>
                <span className="font-medium">
                  {w.historical_players?.canonical_name}
                  {w.historical_players?.user_id === user.id && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
