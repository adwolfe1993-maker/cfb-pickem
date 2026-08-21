import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Trophy, CheckCircle2, XCircle, Circle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import StandingsExportTable from '@/components/StandingsExportTable'
import SimilaritiesMatrix from '@/components/SimilaritiesMatrix'
import SeasonTabs from '@/components/SeasonTabs'

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

type WeekStanding = {
  user_id: string
  display_name: string
  raw_score: number
  win_the_week: boolean
}

type DnPick = {
  picked_team: string
  week_name: string
  kickoff_time: string
  is_correct: boolean | null
}

type MatrixRow = {
  user_a_id: string
  user_a_name: string
  user_b_id: string
  user_b_name: string
  games_compared: number
  games_agreed: number
  agreement_rate: number
}

async function buildStandingsSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seasonId: string,
  seasonName: string,
  currentUserId: string,
  isCommissioner: boolean
) {
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Season Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        <StandingsExportTable
          seasonName={seasonName}
          standings={standings}
          completedWeeks={completedWeeks ?? []}
          weekRawScores={weekRawScores}
          currentUserId={currentUserId}
          isCommissioner={isCommissioner}
        />
      </CardContent>
    </Card>
  )
}

async function buildWinTheWeekSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seasonId: string
) {
  const { data: weeks } = await supabase
    .from('weeks')
    .select('id, name, week_number')
    .eq('season_id', seasonId)
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
    <div className="flex flex-col gap-4">
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

async function buildBonusTeamSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seasonId: string,
  currentUserId: string
) {
  const { data: weeks } = await supabase
    .from('weeks')
    .select('id, name')
    .eq('season_id', seasonId)

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
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Every team used as a Bonus Team pick this season, revealed once that game&apos;s
        kickoff has passed. Each team can only be used once per season.
      </p>

      <div className="flex flex-col gap-3">
        {participants.map((p) => {
          const history = historyByUser[p.id] ?? []
          return (
            <Card key={p.id} className={p.id === currentUserId ? 'border-primary' : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {p.display_name}
                  {p.id === currentUserId && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Bonus Team picks revealed yet.</p>
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

async function buildSimilaritiesSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seasonId: string,
  currentUserId: string
) {
  const { data: matrixData } = await supabase.rpc('get_similarities_matrix', {
    p_season_id: seasonId,
  })
  const rows = (matrixData ?? []) as MatrixRow[]

  type Edge = { otherId: string; otherName: string; rate: number; compared: number }
  const edgesByUser: Record<string, Edge[]> = {}
  const nameById: Record<string, string> = {}

  for (const r of rows) {
    nameById[r.user_a_id] = r.user_a_name
    nameById[r.user_b_id] = r.user_b_name

    if (!edgesByUser[r.user_a_id]) edgesByUser[r.user_a_id] = []
    if (!edgesByUser[r.user_b_id]) edgesByUser[r.user_b_id] = []

    edgesByUser[r.user_a_id].push({
      otherId: r.user_b_id,
      otherName: r.user_b_name,
      rate: r.agreement_rate,
      compared: r.games_compared,
    })
    edgesByUser[r.user_b_id].push({
      otherId: r.user_a_id,
      otherName: r.user_a_name,
      rate: r.agreement_rate,
      compared: r.games_compared,
    })
  }

  const participantIds = Object.keys(edgesByUser).sort((a, b) =>
    nameById[a].localeCompare(nameById[b])
  )

  const MIN_GAMES_FOR_HEADLINE = 3

  const myEdges = edgesByUser[currentUserId] ?? []
  const myQualifyingEdges = myEdges.filter((e) => e.compared >= MIN_GAMES_FOR_HEADLINE)
  const myEdgePool = myQualifyingEdges.length > 0 ? myQualifyingEdges : myEdges
  const myMost = myEdgePool.length > 0
    ? myEdgePool.reduce((a, b) => (b.rate > a.rate ? b : a))
    : null
  const myLeast = myEdgePool.length > 0
    ? myEdgePool.reduce((a, b) => (b.rate < a.rate ? b : a))
    : null

  const qualifyingRows = rows.filter((r) => r.games_compared >= MIN_GAMES_FOR_HEADLINE)
  const rowPool = qualifyingRows.length > 0 ? qualifyingRows : rows
  const mostSimilarPair = rowPool.length > 0
    ? rowPool.reduce((a, b) => (b.agreement_rate > a.agreement_rate ? b : a))
    : null
  const leastSimilarPair = rowPool.length > 0
    ? rowPool.reduce((a, b) => (b.agreement_rate < a.agreement_rate ? b : a))
    : null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        See how often you and everyone else pick the same winners, based on games that have
        already kicked off.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No games have kicked off yet this week — check back once picks start locking in.
        </p>
      ) : (
        <>
          {myMost && myLeast && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">You</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <p>
                  Most similar to <span className="font-medium">{myMost.otherName}</span>{' '}
                  ({myMost.rate}%)
                </p>
                <p>
                  Least similar to <span className="font-medium">{myLeast.otherName}</span>{' '}
                  ({myLeast.rate}%)
                </p>
              </CardContent>
            </Card>
          )}

          {mostSimilarPair && leastSimilarPair && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">League-Wide</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <p>
                  Most in sync:{' '}
                  <span className="font-medium">
                    {mostSimilarPair.user_a_name} &amp; {mostSimilarPair.user_b_name}
                  </span>{' '}
                  ({mostSimilarPair.agreement_rate}%)
                </p>
                <p>
                  Furthest apart:{' '}
                  <span className="font-medium">
                    {leastSimilarPair.user_a_name} &amp; {leastSimilarPair.user_b_name}
                  </span>{' '}
                  ({leastSimilarPair.agreement_rate}%)
                </p>
              </CardContent>
            </Card>
          )}

          <SimilaritiesMatrix
            participantIds={participantIds}
            nameById={nameById}
            edgesByUser={edgesByUser}
          />
        </>
      )}
    </div>
  )
}

export default async function SeasonPage() {
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

  const isCommissioner = profile?.role === 'commissioner'

  const [standingsSection, winTheWeekSection, bonusTeamSection, similaritiesSection] =
    await Promise.all([
      buildStandingsSection(supabase, season.id, season.name, user.id, isCommissioner),
      buildWinTheWeekSection(supabase, season.id),
      buildBonusTeamSection(supabase, season.id, user.id),
      buildSimilaritiesSection(supabase, season.id, user.id),
    ])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">{season.name}</h1>
        <p className="text-sm text-muted-foreground">
          Standings, weekly winners, Bonus Team picks, and Similarities, all in one place.
        </p>
      </div>

      <SeasonTabs
        standings={standingsSection}
        winTheWeek={winTheWeekSection}
        bonusTeamHistory={bonusTeamSection}
        similarities={similaritiesSection}
      />
    </div>
  )
}
