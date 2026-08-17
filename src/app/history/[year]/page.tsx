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
  conf_title_score: number | null
  historical_player_id: string
  historical_players: { id: string; canonical_name: string; user_id: string | null } | null
}

type WtwRow = {
  week_number: number
  historical_players: { canonical_name: string; user_id: string | null } | null
}

type WeeklyScoreRow = {
  historical_player_id: string
  week_number: number
  score: number
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
      'team_name, gross_total, net_score, rank, tiebreaker_avg, conf_title_score, historical_player_id, historical_players(id, canonical_name, user_id)'
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

  const { data: weeklyData } = await supabase
    .from('historical_weekly_scores')
    .select('historical_player_id, week_number, score')
    .eq('year', year)

  const weeklyScores = (weeklyData ?? []) as WeeklyScoreRow[]

  // Regular season net = sum of every regular-season weekly score minus
  // the single lowest week (charter Sec 4.7), computed directly from real
  // per-week data. The stored Net Score column isn't used here -- confirmed
  // the original spreadsheet's own drop-week formula doesn't always drop
  // the true minimum week (e.g. Ally, 2020: it dropped a 10-point week
  // instead of her actual 9-point low week).
  const weeksByPlayer = new Map<string, number[]>()
  for (const w of weeklyScores) {
    if (!weeksByPlayer.has(w.historical_player_id)) weeksByPlayer.set(w.historical_player_id, [])
    weeksByPlayer.get(w.historical_player_id)!.push(w.score)
  }
  const regSeasonNetByPlayer = new Map<string, { net: number; dropped: number }>()
  for (const [playerId, scores] of weeksByPlayer) {
    const sum = scores.reduce((a, b) => a + b, 0)
    const min = Math.min(...scores)
    regSeasonNetByPlayer.set(playerId, { net: sum - min, dropped: min })
  }

  const overallChamp = standings.find((s) => s.rank === 1)

  let regSeasonChamp: StandingRow | undefined
  let bestRegNet = -Infinity
  for (const s of standings) {
    const regNet = regSeasonNetByPlayer.get(s.historical_player_id)?.net
    if (regNet !== undefined && regNet > bestRegNet) {
      bestRegNet = regNet
      regSeasonChamp = s
    }
  }

  const samePerson =
    overallChamp?.historical_players?.canonical_name ===
    regSeasonChamp?.historical_players?.canonical_name

  const renderName = (s: StandingRow | undefined) =>
    s ? (
      s.team_name ? (
        <>
          {s.team_name}{' '}
          <span className="text-muted-foreground">({s.historical_players?.canonical_name})</span>
        </>
      ) : (
        s.historical_players?.canonical_name
      )
    ) : null

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
        <CardContent className="flex flex-col gap-2 pt-6 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">🏆 Overall / Conference Champion</span>
            <span className="font-semibold">{renderName(overallChamp)}</span>
          </div>
          {!samePerson && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">🎖️ Regular Season Champion</span>
              <span className="font-semibold">{renderName(regSeasonChamp)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Standings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-0 divide-y divide-border">
          {standings.map((s, i) => {
            const isYou = s.historical_players?.user_id === user.id
            const isRegChamp =
              !samePerson && s.historical_player_id === regSeasonChamp?.historical_player_id
            const regInfo = regSeasonNetByPlayer.get(s.historical_player_id)
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
                  {isRegChamp && <span className="ml-1" title="Regular Season Champion">🎖️</span>}
                  {regInfo && s.conf_title_score !== null && (
                    <div className="text-xs text-muted-foreground">
                      Reg. season: {regInfo.net} (dropped {regInfo.dropped}) + Conf. Title:{' '}
                      {s.conf_title_score}
                    </div>
                  )}
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
