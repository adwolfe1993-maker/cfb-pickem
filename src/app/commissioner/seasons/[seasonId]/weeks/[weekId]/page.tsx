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
}

type SavedGame = {
  id: string
  api_game_id: string
  away_team: string
  home_team: string
  kickoff_time: string
  game_of_week: boolean
}

export default function WeekDetailPage({
  params,
}: {
  params: Promise<{ seasonId: string; weekId: string }>
}) {
  const { seasonId, weekId } = use(params)
  const [week, setWeek] = useState<Week | null>(null)
  const [savedGames, setSavedGames] = useState<SavedGame[]>([])
  const [cfbdGames, setCfbdGames] = useState<CfbdGame[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [gameOfWeekId, setGameOfWeekId] = useState<number | null>(null)
  const [year, setYear] = useState('2025')
  const [cfbdWeek, setCfbdWeek] = useState('1')
  const [loading, setLoading] = useState(true)
  const [fetchingGames, setFetchingGames] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  const loadData = async () => {
    const [weekRes, gamesRes] = await Promise.all([
      supabase.from('weeks').select('id, name, week_number').eq('id', weekId).single(),
      supabase
        .from('games')
        .select('id, api_game_id, away_team, home_team, kickoff_time, game_of_week')
        .eq('week_id', weekId)
        .order('kickoff_time', { ascending: true }),
    ])

    if (weekRes.error) setError(weekRes.error.message)
    else setWeek(weekRes.data)

    if (gamesRes.error) setError(gamesRes.error.message)
    else setSavedGames(gamesRes.data ?? [])

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

      // Exclude FCS-vs-FCS matchups and games against FCS schools, per charter §4.1
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

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 py-12">
      <div>
        <Link
          href={`/commissioner/seasons/${seasonId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to Season
        </Link>
        <h1 className="text-2xl font-semibold">{week?.name}</h1>
      </div>

      {/* Saved slate */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Current Slate ({savedGames.length} games)</h2>
        {savedGames.length === 0 ? (
          <p className="text-sm text-muted-foreground">No games added yet.</p>
        ) : (
          savedGames.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div>
                <p className="font-medium">
                  {g.away_team} @ {g.home_team}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(g.kickoff_time).toLocaleString()}
                </p>
              </div>
              {g.game_of_week && <Badge>Game of the Week</Badge>}
            </div>
          ))
        )}
      </div>

      {/* Fetch games from CFBD */}
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
