'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import WeekSelector from '@/components/WeekSelector'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Game = {
  id: string
  away_team: string
  home_team: string
  kickoff_time: string
  tv_network: string | null
  game_of_week: boolean
  status: string
}

type Pick = {
  game_id: string
  picked_team: string
  is_double_or_nothing: boolean
  confidence_points: number | null
}

type ManagedProfile = {
  id: string
  display_name: string
}

const CONFIDENCE_VALUES = [9, 8, 7, 6, 5, 4, 3, 2, 1]

export default function PicksPage({
  params,
}: {
  params: Promise<{ weekId: string }>
}) {
  const { weekId } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tiebreakerError, setTiebreakerError] = useState('')
  const [gotwError, setGotwError] = useState('')
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [seasonName, setSeasonName] = useState('')
  const [weekName, setWeekName] = useState('')
  const [weekType, setWeekType] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [games, setGames] = useState<Game[]>([])
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const [tiebreakerTeam, setTiebreakerTeam] = useState<string | null>(null)
  const [gotwAwayPrediction, setGotwAwayPrediction] = useState<number | null>(null)
  const [gotwHomePrediction, setGotwHomePrediction] = useState<number | null>(null)
  const [gotwAwayInput, setGotwAwayInput] = useState('')
  const [gotwHomeInput, setGotwHomeInput] = useState('')
  const [savingGameId, setSavingGameId] = useState<string | null>(null)
  const [savingTiebreaker, setSavingTiebreaker] = useState(false)
  const [savingGotw, setSavingGotw] = useState(false)
  const [dnHistory, setDnHistory] = useState<Record<string, string>>({})

  // realUserId is who's actually logged in (whose session this is).
  // activeProfileId is whose picks we're currently reading/writing — the
  // same as realUserId by default, but can be switched to a managed
  // profile (e.g. a grandparent sharing an inbox). Every picks/selections
  // read and write in this page uses activeProfileId, never realUserId
  // directly, so the rest of the component doesn't need to think about
  // the distinction.
  const [realUserId, setRealUserId] = useState<string | null>(null)
  const [managedProfiles, setManagedProfiles] = useState<ManagedProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null)

  const supabase = createClient()

  // Runs once: who's logged in, and who (if anyone) they manage.
  const loadUserAndProfiles = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }
    setRealUserId(user.id)

    const { data: managed } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('managed_by', user.id)

    setManagedProfiles(managed ?? [])

    const storageKey = `activeProfileId:${user.id}`
    const stored =
      typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
    const storedIsValid =
      stored != null && (stored === user.id || (managed ?? []).some((m) => m.id === stored))

    setActiveProfileId(storedIsValid ? stored! : user.id)
  }

  useEffect(() => {
    loadUserAndProfiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSwitchProfile = (profileId: string) => {
    if (!realUserId) return
    window.localStorage.setItem(`activeProfileId:${realUserId}`, profileId)
    setActiveProfileId(profileId)
  }

  // Runs on mount (once activeProfileId is known) and whenever the active
  // profile or week changes. Everything here reads/writes as
  // activeProfileId — the server-side RLS policies are what actually
  // enforce that this is only allowed when activeProfileId is either
  // realUserId itself or a profile realUserId manages.
  const loadPicksData = async (profileId: string) => {
    setLoading(true)
    setError('')
    setNotFound(false)

    if (managedProfiles.length > 0 || profileId !== realUserId) {
      setActiveProfileName(
        profileId === realUserId
          ? null
          : managedProfiles.find((m) => m.id === profileId)?.display_name ?? null
      )
    } else {
      setActiveProfileName(null)
    }

    const { data: week } = await supabase
      .from('weeks')
      .select('id, name, week_type, season_id')
      .eq('id', weekId)
      .maybeSingle()

    if (!week) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setWeekName(week.name)
    setWeekType(week.week_type)
    setSeasonId(week.season_id)

    const { data: season } = await supabase
      .from('seasons')
      .select('name')
      .eq('id', week.season_id)
      .single()
    setSeasonName(season?.name ?? '')

    const { data: gamesData } = await supabase
      .from('games')
      .select('id, away_team, home_team, kickoff_time, tv_network, game_of_week, status')
      .eq('week_id', weekId)
      .order('kickoff_time', { ascending: true })

    setGames(gamesData ?? [])

    const gameIds = (gamesData ?? []).map((g) => g.id)

    const { data: picksData } =
      gameIds.length > 0
        ? await supabase
            .from('picks')
            .select('game_id, picked_team, is_double_or_nothing, confidence_points')
            .eq('user_id', profileId)
            .in('game_id', gameIds)
        : { data: [] }

    const pickMap: Record<string, Pick> = {}
    for (const p of picksData ?? []) {
      pickMap[p.game_id] = p
    }
    setPicks(pickMap)

    const { data: selection } = await supabase
      .from('weekly_selections')
      .select('tiebreaker_team, gotw_away_score_prediction, gotw_home_score_prediction')
      .eq('user_id', profileId)
      .eq('week_id', weekId)
      .maybeSingle()

    setTiebreakerTeam(selection?.tiebreaker_team ?? null)
    setGotwAwayPrediction(selection?.gotw_away_score_prediction ?? null)
    setGotwHomePrediction(selection?.gotw_home_score_prediction ?? null)
    setGotwAwayInput(
      selection?.gotw_away_score_prediction != null
        ? String(selection.gotw_away_score_prediction)
        : ''
    )
    setGotwHomeInput(
      selection?.gotw_home_score_prediction != null
        ? String(selection.gotw_home_score_prediction)
        : ''
    )

    const { data: otherWeeks } = await supabase
      .from('weeks')
      .select('id, name')
      .eq('season_id', week.season_id)
      .neq('id', weekId)

    if (otherWeeks && otherWeeks.length > 0) {
      const otherWeekIds = otherWeeks.map((w) => w.id)
      const weekNameById = new Map(otherWeeks.map((w) => [w.id, w.name]))

      const { data: otherGames } = await supabase
        .from('games')
        .select('id, week_id')
        .in('week_id', otherWeekIds)

      const weekIdByGameId = new Map((otherGames ?? []).map((g) => [g.id, g.week_id]))
      const otherGameIds = (otherGames ?? []).map((g) => g.id)

      const { data: historyPicks } =
        otherGameIds.length > 0
          ? await supabase
              .from('picks')
              .select('game_id, picked_team')
              .eq('user_id', profileId)
              .eq('is_double_or_nothing', true)
              .in('game_id', otherGameIds)
          : { data: [] }

      const historyMap: Record<string, string> = {}
      for (const p of historyPicks ?? []) {
        const gWeekId = weekIdByGameId.get(p.game_id)
        const gWeekName = gWeekId ? weekNameById.get(gWeekId) : undefined
        if (gWeekName) historyMap[p.picked_team] = gWeekName
      }
      setDnHistory(historyMap)
    } else {
      setDnHistory({})
    }

    setLoading(false)
  }

  useEffect(() => {
    if (activeProfileId) loadPicksData(activeProfileId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId, weekId])

  const handlePick = async (gameId: string, team: string) => {
    if (!activeProfileId) return
    setSavingGameId(gameId)
    setError('')

    const existing = picks[gameId]
    const clearingDN = existing?.is_double_or_nothing && existing.picked_team !== team

    const { data, error } = await supabase
      .from('picks')
      .upsert(
        {
          user_id: activeProfileId,
          game_id: gameId,
          picked_team: team,
          ...(clearingDN ? { is_double_or_nothing: false } : {}),
        },
        { onConflict: 'user_id,game_id' }
      )
      .select('game_id, picked_team, is_double_or_nothing, confidence_points')
      .single()

    if (error) {
      setError(error.message)
    } else if (data) {
      setPicks((prev) => ({ ...prev, [gameId]: data }))
    }

    setSavingGameId(null)
  }

  const handleToggleDN = async (gameId: string) => {
    if (!activeProfileId) return
    const currentPick = picks[gameId]
    if (!currentPick?.picked_team) return

    setSavingGameId(gameId)
    setError('')

    const turningOff = currentPick.is_double_or_nothing

    if (!turningOff) {
      const existingDNGameId = Object.keys(picks).find(
        (gid) => gid !== gameId && picks[gid]?.is_double_or_nothing
      )
      if (existingDNGameId) {
        const { error: clearError } = await supabase
          .from('picks')
          .update({ is_double_or_nothing: false })
          .eq('user_id', activeProfileId)
          .eq('game_id', existingDNGameId)

        if (clearError) {
          setError(clearError.message)
          setSavingGameId(null)
          return
        }

        setPicks((prev) => ({
          ...prev,
          [existingDNGameId]: { ...prev[existingDNGameId], is_double_or_nothing: false },
        }))
      }
    }

    const { data, error } = await supabase
      .from('picks')
      .update({ is_double_or_nothing: !turningOff })
      .eq('user_id', activeProfileId)
      .eq('game_id', gameId)
      .select('game_id, picked_team, is_double_or_nothing, confidence_points')
      .single()

    if (error) {
      setError(error.message)
    } else if (data) {
      setPicks((prev) => ({ ...prev, [gameId]: data }))
    }

    setSavingGameId(null)
  }

  const handleConfidenceChange = async (gameId: string, value: string) => {
    if (!activeProfileId) return
    const currentPick = picks[gameId]
    if (!currentPick?.picked_team) return

    setSavingGameId(gameId)
    setError('')

    const parsed = value === '' ? null : Number(value)

    const { data, error } = await supabase
      .from('picks')
      .update({ confidence_points: parsed })
      .eq('user_id', activeProfileId)
      .eq('game_id', gameId)
      .select('game_id, picked_team, is_double_or_nothing, confidence_points')
      .single()

    if (error) {
      setError(error.message)
    } else if (data) {
      setPicks((prev) => ({ ...prev, [gameId]: data }))
    }

    setSavingGameId(null)
  }

  const handleTiebreakerChange = async (team: string) => {
    if (!activeProfileId) return
    setSavingTiebreaker(true)
    setTiebreakerError('')

    if (!team) {
      setSavingTiebreaker(false)
      return
    }

    const { data, error } = await supabase
      .from('weekly_selections')
      .upsert(
        { user_id: activeProfileId, week_id: weekId, tiebreaker_team: team },
        { onConflict: 'user_id,week_id' }
      )
      .select('tiebreaker_team')
      .single()

    if (error) {
      setTiebreakerError(error.message)
    } else if (data) {
      setTiebreakerTeam(data.tiebreaker_team)
    }

    setSavingTiebreaker(false)
  }

  const handleGotwPredictionBlur = async () => {
    if (!activeProfileId) return

    const awayTrimmed = gotwAwayInput.trim()
    const homeTrimmed = gotwHomeInput.trim()

    if (awayTrimmed === '' || homeTrimmed === '') {
      return
    }

    const awayParsed = Number(awayTrimmed)
    const homeParsed = Number(homeTrimmed)

    if (
      !Number.isInteger(awayParsed) ||
      !Number.isInteger(homeParsed) ||
      awayParsed < 0 ||
      homeParsed < 0
    ) {
      setGotwError('Enter whole numbers for both scores')
      return
    }

    if (awayParsed === gotwAwayPrediction && homeParsed === gotwHomePrediction) {
      return
    }

    setSavingGotw(true)
    setGotwError('')

    const { data, error } = await supabase
      .from('weekly_selections')
      .upsert(
        {
          user_id: activeProfileId,
          week_id: weekId,
          gotw_away_score_prediction: awayParsed,
          gotw_home_score_prediction: homeParsed,
        },
        { onConflict: 'user_id,week_id' }
      )
      .select('gotw_away_score_prediction, gotw_home_score_prediction')
      .single()

    if (error) {
      setGotwError(error.message)
      setGotwAwayInput(gotwAwayPrediction != null ? String(gotwAwayPrediction) : '')
      setGotwHomeInput(gotwHomePrediction != null ? String(gotwHomePrediction) : '')
    } else if (data) {
      setGotwAwayPrediction(data.gotw_away_score_prediction)
      setGotwHomePrediction(data.gotw_home_score_prediction)
    }

    setSavingGotw(false)
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 p-4 py-12">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">Week Not Found</h1>
      </div>
    )
  }

  const now = Date.now()
  const isConferenceTitle = weekType === 'conference_title'

  const dnGameId = Object.keys(picks).find((gid) => picks[gid]?.is_double_or_nothing)
  const dnTeam = dnGameId ? picks[dnGameId]?.picked_team : null

  const allTeams = Array.from(
    new Set(games.flatMap((g) => [g.away_team, g.home_team]))
  ).sort()

  const gameOfWeek = games.find((g) => g.game_of_week)
  const gotwLocked = gameOfWeek ? new Date(gameOfWeek.kickoff_time).getTime() <= now : false
  const gotwComplete = gotwAwayPrediction != null && gotwHomePrediction != null

  const pickableGames = games.filter((g) => g.status !== 'canceled')
  const pickedCount = pickableGames.filter((g) => picks[g.id]?.picked_team).length
  const allPicked = pickedCount === pickableGames.length
  const missingGames = pickableGames.filter((g) => !picks[g.id]?.picked_team)

  const assignedConfidenceValues = new Set(
    pickableGames
      .map((g) => picks[g.id]?.confidence_points)
      .filter((v): v is number => v != null)
  )
  const missingConfidenceValues = CONFIDENCE_VALUES.filter(
    (v) => !assignedConfidenceValues.has(v)
  ).sort((a, b) => a - b)
  const allConfidenceAssigned = missingConfidenceValues.length === 0

  const summaryComplete = isConferenceTitle
    ? allPicked && allConfidenceAssigned && Boolean(tiebreakerTeam)
    : allPicked &&
      Boolean(dnTeam) &&
      Boolean(tiebreakerTeam) &&
      (!gameOfWeek || gotwComplete)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div className="flex flex-col gap-2">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">{seasonName}</h1>
            <p className="text-muted-foreground">
              {weekName}
              {isConferenceTitle && ' — Conference Title Week'}
            </p>
          </div>
          {seasonId && (
            <WeekSelector seasonId={seasonId} currentWeekId={weekId} viewSuffix="" />
          )}
        </div>

        {managedProfiles.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-accent/40 px-3 py-2">
            <label htmlFor="active-profile" className="text-sm font-medium">
              Picking as:
            </label>
            <select
              id="active-profile"
              value={activeProfileId ?? ''}
              onChange={(e) => handleSwitchProfile(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value={realUserId ?? ''}>Yourself</option>
              {managedProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {games.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No games have been added to this week yet.
        </p>
      ) : (
        <>
          <Card className={summaryComplete ? 'border-primary/40' : undefined}>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Picks Summary{activeProfileName ? ` — ${activeProfileName}` : ''}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p>
                {allPicked ? '✅' : '⚠️'} Winners picked: {pickedCount} of{' '}
                {pickableGames.length}
                {!allPicked && missingGames.length > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    — missing:{' '}
                    {missingGames.map((g) => `${g.away_team} @ ${g.home_team}`).join(', ')}
                  </span>
                )}
              </p>

              {isConferenceTitle ? (
                <p>
                  {allConfidenceAssigned ? '✅' : '⚠️'} Confidence points assigned:{' '}
                  {assignedConfidenceValues.size} of 9
                  {!allConfidenceAssigned && (
                    <span className="text-muted-foreground">
                      {' '}
                      — missing: {missingConfidenceValues.join(', ')}
                    </span>
                  )}
                </p>
              ) : (
                <p>
                  {dnTeam ? '✅' : '⚠️'} Double or Nothing:{' '}
                  <span className="font-medium">{dnTeam ?? 'not selected'}</span>
                </p>
              )}

              <p>
                {tiebreakerTeam ? '✅' : '⚠️'} Tiebreaker / Highest Scoring Team:{' '}
                <span className="font-medium">{tiebreakerTeam ?? 'not selected'}</span>
              </p>

              {!isConferenceTitle && gameOfWeek && (
                <p>
                  {gotwComplete ? '✅' : '⚠️'} Game of the Week prediction:{' '}
                  <span className="font-medium">
                    {gotwComplete
                      ? `${gameOfWeek.away_team} ${gotwAwayPrediction} – ${gameOfWeek.home_team} ${gotwHomePrediction}`
                      : 'not entered'}
                  </span>
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Link
              href={`/picks/${weekId}/status`}
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              See who else has picked →
            </Link>
            <Link
              href={`/picks/${weekId}/grid`}
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Pick grid →
            </Link>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-3">
            {games.map((game) => {
              const kickoff = new Date(game.kickoff_time)
              const locked = kickoff.getTime() <= now
              const canceled = game.status === 'canceled'
              const pick = picks[game.id]
              const saving = savingGameId === game.id
              const usedWeek = pick?.picked_team ? dnHistory[pick.picked_team] : undefined
              const alreadyUsedElsewhere = Boolean(usedWeek) && !pick?.is_double_or_nothing

              const usedConfidenceByOtherGames = new Set(
                games
                  .filter((g) => g.id !== game.id)
                  .map((g) => picks[g.id]?.confidence_points)
                  .filter((v): v is number => v != null)
              )

              return (
                <Card key={game.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                    <CardTitle className="text-base font-medium">
                      {game.away_team} @ {game.home_team}
                    </CardTitle>
                    <div className="flex shrink-0 gap-1">
                      {game.game_of_week && <Badge>Game of the Week</Badge>}
                      {canceled ? (
                        <Badge variant="destructive">Canceled</Badge>
                      ) : (
                        <Badge variant={locked ? 'secondary' : 'outline'}>
                          {locked ? 'Locked' : 'Open'}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 pt-0">
                    <p className="text-xs text-muted-foreground">
                      {kickoff.toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {game.tv_network ? ` · ${game.tv_network}` : ''}
                    </p>

                    {locked || canceled ? (
                      <p className="text-sm">
                        Your pick:{' '}
                        <span className="font-medium">
                          {pick?.picked_team ?? '— none yet —'}
                        </span>
                        {pick?.is_double_or_nothing && (
                          <Badge variant="secondary" className="ml-2">
                            D/N
                          </Badge>
                        )}
                        {isConferenceTitle && pick?.confidence_points != null && (
                          <Badge variant="secondary" className="ml-2">
                            Confidence: {pick.confidence_points}
                          </Badge>
                        )}
                      </p>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          {[game.away_team, game.home_team].map((team) => {
                            const selected = pick?.picked_team === team
                            return (
                              <button
                                key={team}
                                type="button"
                                disabled={saving}
                                onClick={() => handlePick(game.id, team)}
                                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                                  selected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border hover:bg-accent'
                                }`}
                              >
                                {team}
                              </button>
                            )
                          })}
                        </div>

                        {pick?.picked_team && isConferenceTitle && (
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-muted-foreground">
                              Confidence points:
                            </label>
                            <select
                              value={pick.confidence_points ?? ''}
                              disabled={saving}
                              onChange={(e) =>
                                handleConfidenceChange(game.id, e.target.value)
                              }
                              className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
                            >
                              <option value="">—</option>
                              {CONFIDENCE_VALUES.map((n) => (
                                <option
                                  key={n}
                                  value={n}
                                  disabled={usedConfidenceByOtherGames.has(n)}
                                >
                                  {n}
                                  {usedConfidenceByOtherGames.has(n) ? ' (used)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {pick?.picked_team && !isConferenceTitle && (
                          alreadyUsedElsewhere ? (
                            <p className="text-sm text-muted-foreground">
                              Double or Nothing unavailable — {pick.picked_team} was already
                              used in {usedWeek}
                            </p>
                          ) : (
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={pick.is_double_or_nothing}
                                disabled={saving}
                                onChange={() => handleToggleDN(game.id)}
                                className="h-4 w-4 accent-primary"
                              />
                              Double or Nothing on {pick.picked_team}
                            </label>
                          )
                        )}

                        {!isConferenceTitle && game.game_of_week && (
                          <div className="mt-1 flex flex-col gap-1">
                            <label className="text-sm text-muted-foreground">
                              Predict the final score:
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={gotwAwayInput}
                                disabled={savingGotw || gotwLocked}
                                onChange={(e) => setGotwAwayInput(e.target.value)}
                                onBlur={handleGotwPredictionBlur}
                                placeholder="0"
                                aria-label={`Predicted score for ${game.away_team}`}
                                className="w-20 rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                              />
                              <span className="text-sm text-muted-foreground">
                                {game.away_team}
                              </span>
                              <span className="text-sm text-muted-foreground">—</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={gotwHomeInput}
                                disabled={savingGotw || gotwLocked}
                                onChange={(e) => setGotwHomeInput(e.target.value)}
                                onBlur={handleGotwPredictionBlur}
                                placeholder="0"
                                aria-label={`Predicted score for ${game.home_team}`}
                                className="w-20 rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                              />
                              <span className="text-sm text-muted-foreground">
                                {game.home_team}
                              </span>
                            </div>
                            {gotwError && (
                              <p className="text-sm text-destructive">{gotwError}</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Tiebreaker / Highest Scoring Team
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Pick any team from this week&apos;s slate. Used only as a Win the Week
                tiebreaker — each team can be selected once per season.
              </p>
              <select
                value={tiebreakerTeam ?? ''}
                disabled={savingTiebreaker}
                onChange={(e) => handleTiebreakerChange(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">— Select a team —</option>
                {allTeams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
              {tiebreakerError && (
                <p className="text-sm text-destructive">{tiebreakerError}</p>
              )}
            </CardContent>
          </Card>

          {Object.keys(dnHistory).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  Double or Nothing History ({seasonName})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {Object.entries(dnHistory).map(([team, wk]) => (
                  <p key={team} className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{team}</span> — {wk}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
