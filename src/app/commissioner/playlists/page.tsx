'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { suggestThemeEmoji } from '@/utils/themeEmoji'

type WeekOption = {
  id: string
  name: string
  season_id: string
  season_name: string
}

type Submission = {
  user_id: string
  song: string
  updated_at: string
  display_name: string
  team_name: string | null
}

type Playlist = {
  id: string
  season_year: number
  week_number: number
  theme: string | null
  emoji: string | null
  spotify_url: string
}

export default function CommissionerPlaylistsPage() {
  const supabase = createClient()

  const [weeks, setWeeks] = useState<WeekOption[]>([])
  const [selectedWeekId, setSelectedWeekId] = useState('')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingWeeks, setLoadingWeeks] = useState(true)
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [subsError, setSubsError] = useState('')

  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(true)
  const [playlistsError, setPlaylistsError] = useState('')

  const [addYear, setAddYear] = useState('')
  const [addWeek, setAddWeek] = useState('')
  const [addTheme, setAddTheme] = useState('')
  const [addEmoji, setAddEmoji] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [themeAutoFilled, setThemeAutoFilled] = useState(false)

  // Auto-fill theme + emoji from a planned season_themes entry when
  // year+week match one — season_themes is keyed by season_id, so this
  // first has to resolve the season by name (seasons are named plainly by
  // year, e.g. "2026"). Never overwrites something the commissioner
  // already typed by hand, and clears itself if they change year/week
  // away from the match. If there's no planned theme (true for all
  // historical years before this app existed), falls back to guessing an
  // emoji from whatever theme text they type in manually.
  useEffect(() => {
    const year = parseInt(addYear, 10)
    const week = parseInt(addWeek, 10)

    if (!year || Number.isNaN(week)) {
      if (themeAutoFilled) {
        setAddTheme('')
        setAddEmoji('')
        setThemeAutoFilled(false)
      }
      return
    }

    let cancelled = false

    const lookup = async () => {
      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('name', String(year))
        .maybeSingle()

      if (!season || cancelled) return

      const { data: themeRow } = await supabase
        .from('season_themes')
        .select('theme, emoji')
        .eq('season_id', season.id)
        .eq('week_number', week)
        .maybeSingle()

      if (cancelled) return

      if (themeRow?.theme && (addTheme === '' || themeAutoFilled)) {
        setAddTheme(themeRow.theme)
        setAddEmoji(themeRow.emoji ?? suggestThemeEmoji(themeRow.theme))
        setThemeAutoFilled(true)
      } else if (!themeRow?.theme && themeAutoFilled) {
        setAddTheme('')
        setAddEmoji('')
        setThemeAutoFilled(false)
      }
    }

    lookup()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addYear, addWeek])

  const [bulkText, setBulkText] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkResult, setBulkResult] = useState('')

  const loadWeeks = async () => {
    setLoadingWeeks(true)
    const { data } = await supabase
      .from('weeks')
      .select('id, name, season_id, seasons(name)')
      .order('created_at', { ascending: false })

    const options: WeekOption[] = (data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      season_id: w.season_id,
      season_name: (w.seasons as unknown as { name: string } | null)?.name ?? '',
    }))
    setWeeks(options)
    setSelectedWeekId((prev) => prev || options[0]?.id || '')
    setLoadingWeeks(false)
  }

  const loadPlaylists = async () => {
    setLoadingPlaylists(true)
    setPlaylistsError('')
    const { data, error } = await supabase
      .from('playlists')
      .select('id, season_year, week_number, theme, emoji, spotify_url')
      .order('season_year', { ascending: false })
      .order('week_number', { ascending: false })

    if (error) setPlaylistsError(error.message)
    else setPlaylists(data ?? [])
    setLoadingPlaylists(false)
  }

  useEffect(() => {
    loadWeeks()
    loadPlaylists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedWeekId) return

    const loadSubs = async () => {
      setLoadingSubs(true)
      setSubsError('')

      const week = weeks.find((w) => w.id === selectedWeekId)

      const { data: subs, error } = await supabase
        .from('song_submissions')
        .select('user_id, song, updated_at')
        .eq('week_id', selectedWeekId)
        .order('updated_at', { ascending: false })

      if (error) {
        setSubsError(error.message)
        setLoadingSubs(false)
        return
      }

      const userIds = (subs ?? []).map((s) => s.user_id)
      if (userIds.length === 0) {
        setSubmissions([])
        setLoadingSubs(false)
        return
      }

      const [{ data: users }, { data: profiles }] = await Promise.all([
        supabase.from('users').select('id, display_name').in('id', userIds),
        week
          ? supabase
              .from('season_profiles')
              .select('user_id, team_name')
              .eq('season_id', week.season_id)
              .in('user_id', userIds)
          : Promise.resolve({ data: [] as { user_id: string; team_name: string }[] }),
      ])

      const nameById = new Map((users ?? []).map((u) => [u.id, u.display_name]))
      const teamById = new Map((profiles ?? []).map((p) => [p.user_id, p.team_name]))

      setSubmissions(
        (subs ?? []).map((s) => ({
          user_id: s.user_id,
          song: s.song,
          updated_at: s.updated_at,
          display_name: nameById.get(s.user_id) ?? 'Unknown',
          team_name: teamById.get(s.user_id) ?? null,
        }))
      )
      setLoadingSubs(false)
    }

    loadSubs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeekId])

  const handleAddPlaylist = async () => {
    setPlaylistsError('')
    const year = parseInt(addYear, 10)
    const week = parseInt(addWeek, 10)

    if (!year || Number.isNaN(week) || !addUrl.trim()) {
      setPlaylistsError('Season year, week #, and a Spotify link are required.')
      return
    }

    setAdding(true)
    const { error } = await supabase.from('playlists').upsert(
      {
        season_year: year,
        week_number: week,
        theme: addTheme.trim() || null,
        emoji: addEmoji.trim() || (addTheme.trim() ? suggestThemeEmoji(addTheme.trim()) : null),
        spotify_url: addUrl.trim(),
      },
      { onConflict: 'season_year,week_number' }
    )
    setAdding(false)

    if (error) {
      setPlaylistsError(error.message)
      return
    }

    setAddYear('')
    setAddWeek('')
    setAddTheme('')
    setAddEmoji('')
    setAddUrl('')
    setThemeAutoFilled(false)
    loadPlaylists()
  }

  const handleDeletePlaylist = async (id: string) => {
    setPlaylistsError('')
    const { error } = await supabase.from('playlists').delete().eq('id', id)
    if (error) setPlaylistsError(error.message)
    else loadPlaylists()
  }

  const handleBulkAdd = async () => {
    setBulkResult('')
    setPlaylistsError('')

    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const rows: { season_year: number; week_number: number; theme: string | null; emoji: string | null; spotify_url: string }[] = []
    const skipped: string[] = []

    for (const line of lines) {
      const parts = (line.includes('\t') ? line.split('\t') : line.split(',')).map((p) => p.trim())
      const [yearRaw, weekRaw, theme, url, explicitEmoji] = parts
      const year = parseInt(yearRaw ?? '', 10)
      const week = parseInt(weekRaw ?? '', 10)

      if (!year || Number.isNaN(week) || !url) {
        skipped.push(line)
        continue
      }

      rows.push({
        season_year: year,
        week_number: week,
        theme: theme || null,
        emoji: explicitEmoji || (theme ? suggestThemeEmoji(theme) : null),
        spotify_url: url,
      })
    }

    if (rows.length === 0) {
      setBulkResult('Nothing valid to add — expected one row per line: year, week #, theme, link.')
      return
    }

    setBulkSaving(true)
    const { error } = await supabase
      .from('playlists')
      .upsert(rows, { onConflict: 'season_year,week_number' })
    setBulkSaving(false)

    if (error) {
      setPlaylistsError(error.message)
      return
    }

    setBulkResult(
      `Added/updated ${rows.length} playlist${rows.length === 1 ? '' : 's'}.` +
        (skipped.length > 0 ? ` Skipped ${skipped.length} line(s) that didn't parse.` : '')
    )
    setBulkText('')
    loadPlaylists()
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-4 py-12">
      <div>
        <Link href="/commissioner" className="text-sm text-muted-foreground hover:underline">
          ← Commissioner Tools
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Playlists</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">This week&apos;s song submissions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loadingWeeks ? (
            <Skeleton className="h-9 w-full" />
          ) : weeks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No weeks exist yet.</p>
          ) : (
            <select
              value={selectedWeekId}
              onChange={(e) => setSelectedWeekId(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.season_name} — {w.name}
                </option>
              ))}
            </select>
          )}

          {subsError && <p className="text-sm text-destructive">{subsError}</p>}

          {loadingSubs ? (
            <Skeleton className="h-24 w-full" />
          ) : submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No song submissions for this week yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {submissions.map((s) => (
                <li key={s.user_id} className="flex flex-col gap-0.5 py-2">
                  <span className="font-medium">{s.song}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.display_name}
                    {s.team_name ? ` — ${s.team_name}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Add a playlist</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="add-year">Season (year)</Label>
              <Input
                id="add-year"
                type="number"
                value={addYear}
                onChange={(e) => setAddYear(e.target.value)}
                placeholder="2026"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="add-week">Week #</Label>
              <Input
                id="add-week"
                type="number"
                value={addWeek}
                onChange={(e) => setAddWeek(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <Label htmlFor="add-theme">Theme (optional)</Label>
              <Input
                id="add-theme"
                value={addTheme}
                onChange={(e) => {
                  const value = e.target.value
                  setAddTheme(value)
                  setAddEmoji(value.trim() ? suggestThemeEmoji(value) : '')
                  setThemeAutoFilled(false)
                }}
                placeholder="e.g. Kickoff Weekend"
              />
              {themeAutoFilled && (
                <p className="text-xs text-muted-foreground">Filled in from the planned theme.</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="add-emoji">Emoji</Label>
              <Input
                id="add-emoji"
                value={addEmoji}
                onChange={(e) => setAddEmoji(e.target.value)}
                placeholder="🎵"
                className="w-16 text-center text-lg"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="add-url">Spotify link</Label>
            <Input
              id="add-url"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              placeholder="https://open.spotify.com/playlist/..."
            />
          </div>
          <Button onClick={handleAddPlaylist} disabled={adding} className="self-start">
            {adding ? 'Saving...' : 'Add playlist'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Bulk add from a spreadsheet</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            One playlist per line: year, week #, theme, link, and an optional emoji override —
            either paste tab-separated rows straight from Excel, or comma-separated. Theme and
            emoji can be left blank (an emoji gets auto-suggested from the theme). Re-pasting a
            year/week that already exists updates it rather than duplicating.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={'2023\t1\tKickoff Weekend\thttps://open.spotify.com/playlist/...\n2023\t2\t\thttps://open.spotify.com/playlist/...'}
            className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
          />
          <Button onClick={handleBulkAdd} disabled={bulkSaving || !bulkText.trim()} className="self-start">
            {bulkSaving ? 'Saving...' : 'Bulk add'}
          </Button>
          {bulkResult && <p className="text-sm text-muted-foreground">{bulkResult}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Existing playlists</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {playlistsError && <p className="text-sm text-destructive">{playlistsError}</p>}
          {loadingPlaylists ? (
            <Skeleton className="h-24 w-full" />
          ) : playlists.length === 0 ? (
            <p className="text-sm text-muted-foreground">No playlists added yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {playlists.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {p.season_year} — Week {p.week_number}
                      {p.theme ? `: ${p.emoji ? `${p.emoji} ` : ''}${p.theme}` : ''}
                    </span>
                    <a
                      href={p.spotify_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      {p.spotify_url}
                    </a>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDeletePlaylist(p.id)}>
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
