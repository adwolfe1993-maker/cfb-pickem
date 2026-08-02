'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { CfbdGame } from '@/lib/cfbd'

type Week = {
  id: string
  name: string
  week_number: number
  status: string
}

type SavedGame = {
  id: string
  api_game_id: string
  away_team: string
  home_team: string
  kickoff_time: string
  game_of_week: boolean
  status: string
  away_score: number | null
  home_score: number | null
  winner: string | null
}

type ResultInput = { away: string; home: string }

export default function WeekDetailPage({
  params,
}: {
  params: Promise<{ seasonId: string; weekId: string }>
}) {
  const { seasonId, weekId } = use(params)
  const [week, setWeek] = useState<Week | null>(null)
  const [seasonStatus, setSeasonStatus] = useState<string | null>(null)
  const [savedGames, setSavedGames] = useState<SavedGame[]>([])
  const [cfbdGames, setCfbdGames] = useState<CfbdGame[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [gameOfWeekId, setGameOfWeekId] = useState<number | null>(null)
  const [year, setYear] = useState('2025')
  const [cfbdWeek, setCfbdWeek] = useState('1')
  const [loading, setLoading] = useState(true)
  const [fetchingGames, setFetchingGames] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState('')
  const [resultInputs, setResultInputs] = useState<Record<string, ResultInput>>({})
  const [resultErrors, setResultErrors] = useState<Record<string, string>>({})
  const [savingResultId, setSavingResultId] = useState<string | null>(null)

  const supabase = createClient()

  const loadData = async () => {
    const [weekRes, seasonRes, gamesRes] = await Promise.all([
      supabase.from('weeks').select('id, name, week_number, status').eq('id', weekId).single(),
      supabase.from('seasons').select('status').eq('id', seasonId).single(),
      supabase
        .from('games')
        .select(
          'id, api_game_id, away_team, home_team, kickoff_time, game_of_week, status, away_score, home_score, winner'
        )
        .eq('week_id', weekId)
        .order('kickoff_time', { ascending: true }),
    ])

    if (weekRes.error) setError(weekRes.error.message)
    else setWeek(weekRes.data)

    if (seasonRes.error) setError(seasonRes.error.message)
    else setSeasonStatus(seasonRes.data?.status ?? null)

    if (gamesRes.error) {
      setError(gamesRes.error.message)
    } else {
      const games = gamesRes.data ?? []
      setSavedGames(games)
      setResultInputs((prev) => {
        const next = { ...prev }
        for (const g of games) {
          if (!next[g.id]) {
            next[g.id] = {
              away: g.away_score != null ? String(g.away_score) : '',
              home: g.home_score != null ? String(g.home_score) : '',
            }
          }
        }
        return next
      })
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [weekId])

  const handleFetchGames = async () => {
    setFetchingGames(true)
    setError('')
    setCfbdGames([])

    try {
      const res = await fetch(`/api/cfbd/games?year=${year}&week=${cfbdWeek}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch games')

      const fbsGames = (data as CfbdGame[]).filter(
        (g) => g.homeClassification === 'fbs' && g.awayClassification === 'fbs'
      )
      setCfbdGames(fbsGames)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch games')
    } finally {
      setFetchingGames(false)
    }
  }

  const toggleGame = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (gameOfWeekId === id) setGameOfWeekId(null)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSaveSlate = async () => {
    setSaving(true)
    setError('')

    // cfbd_year / cfbd_week persist what year+week these games were actually
    // fetched from — needed so the score-polling job can re-query CFBD's
    // batched weekly endpoint later without guessing or falling back to an
    // expensive per-game lookup.
    const gamesToInsert = cfbdGames
      .filter((g) => selectedIds.has(g.id))
      .map((g) => ({
        week_id: weekId,
        away_team: g.awayTeam,
        home_team: g.homeTeam,
        kickoff_time: g.startDate,
        tv_network: null,
        game_of_week: g.id === gameOfWeekId,
        game_type: 'standard' as const,
        status: 'scheduled' as const,
        api_game_id: String(g.id),
        cfbd_year: Number(year),
        cfbd_week: Number(cfbdWeek),
      }))

    const { error } = await supabase.from('games').insert(gamesToInsert)

    if (error) {
      setError(error.message)
    } else {
      setCfbdGames([])
      setSelectedIds(new Set())
      setGameOfWeekId(null)
      loadData()
    }

    setSaving(false)
  }

  const handleActivateWeek = async () => {
    setActivating(true)
    setError('')

    const [seasonUpdate, weekUpdate] = await Promise.all([
      seasonStatus !== 'active'
        ? supabase.from('seasons').update({ status: 'active' }).eq('id', seasonId)
        : Promise.resolve({ error: null }),
      supabase.from('weeks').update({ status: 'active' }).eq('id', weekId),
    ])

    if (seasonUpdate.error) setError(seasonUpdate.error.message)
    else if (weekUpdate.error) setError(weekUpdate.error.message)
    else {
      loadData()
      // Notification failure deliberately doesn't block week activation —
      // the week going live is the state change that actually matters.
      supabase.functions
        .invoke('send-notification', {
          body: {
            title: 'Picks are open!',
            body: `${week?.name ?? 'This week'}'s slate is live — get your picks in.`,
          },
        })
        .then(({ error: fnError }) => {
          if (fnError) console.error('Notification send failed:', fnError)
        })
        .catch((err) => {
          console.error('Notification send failed:', err)
        })
    }

    setActivating(false)
  }

  const handleCompleteWeek = async () => {
    setCompleting(true)
    setError('')

    const { error } = await supabase.from('weeks').update({ status: 'complete' }).eq('id', weekId)

    if (error) setError(error.message)
    else loadData()

    setCompleting(false)
  }

  const handleSaveResult = async (game: SavedGame) => {
    const input = resultInputs[game.id] ?? { away: '', home: '' }
    const awayTrimmed = input.away.trim()
    const homeTrimmed = input.home.trim()

    setResultErrors((prev) => ({ ...prev, [game.id]: '' }))

    if (awayTrimmed === '' || homeTrimmed === '') {
      setResultErrors((prev) => ({ ...prev, [game.id]: 'Enter both scores' }))
      return
    }

    const awayScore = Number(awayTrimmed)
    const homeScore = Number(homeTrimmed)

    if (
      !Number.isInteger(awayScore) ||
      !Number.isInteger(homeScore) ||
      awayScore < 0 ||
      homeScore < 0
    ) {
      setResultErrors((prev) => ({
        ...prev,
        [game.id]: 'Scores must be whole numbers, 0 or higher',
      }))
      return
    }

    if (awayScore === homeScore) {
      setResultErrors((prev) => ({
        ...prev,
        [game.id]: 'Scores cannot be tied — college football games always have a winner',
      }))
      return
    }

    setSavingResultId(game.id)

    const winner = awayScore > homeScore ? game.away_team : game.home_team

    const { error } = await supabase
      .from('games')
      .update({
        away_score: awayScore,
        home_score: homeScore,
        winner,
        status: 'final',
      })
      .eq('id', game.id)

    if (error) {
      setResultErrors((prev) => ({ ...prev, [game.id]: error.message }))
    } else {
      loadData()
    }

    setSavingResultId(null)
  }

  const handleMarkCanceled = async (game: SavedGame) => {
    setSavingResultId(game.id)
    setResultErrors((prev) => ({ ...prev, [game.id]: '' }))

    const { error } = await supabase
      .from('games')
      .update({ status: 'canceled', away_score: null, home_score: null, winner: null })
      .eq('id', game.id)

    if (error) {
      setResultErrors((prev) => ({ ...prev, [game.id]: error.message }))
    } else {
      loadData()
    }

    setSavingResultId(null)
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const allGamesResolved =
    savedGames.length > 0 &&
    savedGames.every((g) => g.status === 'final' || g.status === 'canceled')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 py-12">
      <div>
        <Link
          href={`/commissioner/seasons/${seasonId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to Season
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{week?.name}</h1>
          <Badge
            variant={
              week?.status === 'active'
                ? 'default'
                : week?.status === 'complete'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {week?.status}
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="text-sm text-muted-foreground">
            {week?.status === 'complete' ? (
              <span>
                This week is complete — its results now count toward season standings.
              </span>
            ) : week?.status === 'active' ? (
              <span>
                This week is live — participants can see and submit picks now.
                {!allGamesResolved && ' Enter results for every game to mark it complete.'}
              </span>
            ) : (
              <span>
                This week is still <strong>{week?.status}</strong> — participants can&apos;t see
                or pick it until it&apos;s activated.
                {seasonStatus !== 'active' && ' Activating will also mark the season as active.'}
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {week?.status === 'upcoming' && (
              <Button
                onClick={handleActivateWeek}
                disabled={activating || savedGames.length === 0}
              >
                {activating ? 'Activating...' : 'Activate Week'}
              </Button>
            )}
            {week?.status === 'active' && (
              <Button
                onClick={handleCompleteWeek}
                disabled={completing || !allGamesResolved}
                title={
                  !allGamesResolved
                    ? 'Every game needs a final result or must be marked canceled first'
                    : undefined
                }
              >
                {completing ? 'Completing...' : 'Mark Week Complete'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Current Slate ({savedGames.length} games)</h2>
        {savedGames.length === 0 ? (
          <p className="text-sm text-muted-foreground">No games added yet.</p>
        ) : (
          savedGames.map((g) => {
            const input = resultInputs[g.id] ?? { away: '', home: '' }
            const isSaving = savingResultId === g.id
            const resultError = resultErrors[g.id]

            return (
              <div key={g.id} className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {g.away_team} @ {g.home_team}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(g.kickoff_time).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {g.game_of_week && <Badge>Game of the Week</Badge>}
                    <Badge
                      variant={
                        g.status === 'final'
                          ? 'secondary'
                          : g.status === 'canceled'
                            ? 'destructive'
                            : 'outline'
                      }
                    >
                      {g.status}
                    </Badge>
                  </div>
                </div>

                {g.status === 'canceled' ? (
                  <p className="text-sm text-muted-foreground">
                    Canceled — excluded from scoring entirely.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`away-${g.id}`} className="text-xs">
                        {g.away_team}
                      </Label>
                      <Input
                        id={`away-${g.id}`}
                        className="w-20"
                        inputMode="numeric"
                        value={input.away}
                        onChange={(e) =>
                          setResultInputs((prev) => ({
                            ...prev,
                            [g.id]: { ...input, away: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`home-${g.id}`} className="text-xs">
                        {g.home_team}
                      </Label>
                      <Input
                        id={`home-${g.id}`}
                        className="w-20"
                        inputMode="numeric"
                        value={input.home}
                        onChange={(e) =>
                          setResultInputs((prev) => ({
                            ...prev,
                            [g.id]: { ...input, home: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <Button size="sm" disabled={isSaving} onClick={() => handleSaveResult(g)}>
                      {isSaving ? 'Saving...' : g.status === 'final' ? 'Update Result' : 'Mark Final'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => handleMarkCanceled(g)}
                    >
                      Mark Canceled
                    </Button>
                    {g.status === 'final' && g.winner && (
                      <span className="text-sm text-muted-foreground">
                        Final: {g.away_team} {g.away_score} – {g.home_team} {g.home_score} (
                        {g.winner} wins)
                      </span>
                    )}
                  </div>
                )}

                {resultError && <p className="text-sm text-destructive">{resultError}</p>}
              </div>
            )
          })
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Games from CFBD</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                className="w-24"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cfbd-week">CFBD Week #</Label>
              <Input
                id="cfbd-week"
                className="w-24"
                value={cfbdWeek}
                onChange={(e) => setCfbdWeek(e.target.value)}
              />
            </div>
            <Button onClick={handleFetchGames} disabled={fetchingGames}>
              {fetchingGames ? 'Fetching...' : 'Fetch Games'}
            </Button>
          </div>

          {cfbdGames.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Check games to include. Click the star to mark Game of the Week.
              </p>
              <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                {cfbdGames.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <Checkbox
                      checked={selectedIds.has(g.id)}
                      onCheckedChange={() => toggleGame(g.id)}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {g.awayTeam} @ {g.homeTeam}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(g.startDate).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!selectedIds.has(g.id)}
                      onClick={() => setGameOfWeekId(g.id)}
                      className={`text-xs font-medium ${
                        gameOfWeekId === g.id
                          ? 'text-primary'
                          : 'text-muted-foreground disabled:opacity-30'
                      }`}
                    >
                      {gameOfWeekId === g.id ? '★ Game of the Week' : '☆ Set as GOTW'}
                    </button>
                  </div>
                ))}
              </div>
              <Button
                onClick={handleSaveSlate}
                disabled={saving || selectedIds.size === 0}
                className="self-start"
              >
                {saving ? 'Saving...' : `Add ${selectedIds.size} Games to Slate`}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
