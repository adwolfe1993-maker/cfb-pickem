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

type Season = {
  id: string
  name: string
}

type Theme = {
  id: string
  week_number: number
  theme: string
  emoji: string | null
}

export default function SeasonThemesPage() {
  const supabase = createClient()

  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonId, setSeasonId] = useState('')
  const [loadingSeasons, setLoadingSeasons] = useState(true)

  const [themes, setThemes] = useState<Theme[]>([])
  const [loadingThemes, setLoadingThemes] = useState(false)
  const [error, setError] = useState('')

  const [addWeek, setAddWeek] = useState('')
  const [addTheme, setAddTheme] = useState('')
  const [addEmoji, setAddEmoji] = useState('')
  const [emojiAutoFilled, setEmojiAutoFilled] = useState(true)
  const [adding, setAdding] = useState(false)

  const [bulkText, setBulkText] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkResult, setBulkResult] = useState('')

  const loadSeasons = async () => {
    setLoadingSeasons(true)
    const { data } = await supabase
      .from('seasons')
      .select('id, name')
      .order('created_at', { ascending: false })

    setSeasons(data ?? [])
    setSeasonId((prev) => prev || data?.[0]?.id || '')
    setLoadingSeasons(false)
  }

  useEffect(() => {
    loadSeasons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadThemes = async () => {
    if (!seasonId) return
    setLoadingThemes(true)
    setError('')

    const { data, error } = await supabase
      .from('season_themes')
      .select('id, week_number, theme, emoji')
      .eq('season_id', seasonId)
      .order('week_number', { ascending: true })

    if (error) setError(error.message)
    else setThemes(data ?? [])
    setLoadingThemes(false)
  }

  useEffect(() => {
    loadThemes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId])

  const handleAdd = async () => {
    setError('')
    const weekNum = parseInt(addWeek, 10)

    if (!weekNum || !addTheme.trim()) {
      setError('Week # and a theme are required.')
      return
    }

    setAdding(true)
    const { error } = await supabase.from('season_themes').upsert(
      {
        season_id: seasonId,
        week_number: weekNum,
        theme: addTheme.trim(),
        emoji: addEmoji.trim() || suggestThemeEmoji(addTheme.trim()),
      },
      { onConflict: 'season_id,week_number' }
    )
    setAdding(false)

    if (error) {
      setError(error.message)
      return
    }

    setAddWeek('')
    setAddTheme('')
    setAddEmoji('')
    setEmojiAutoFilled(true)
    loadThemes()
  }

  const handleDelete = async (id: string) => {
    setError('')
    const { error } = await supabase.from('season_themes').delete().eq('id', id)
    if (error) setError(error.message)
    else loadThemes()
  }

  const handleBulkAdd = async () => {
    setBulkResult('')
    setError('')

    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const rows: { season_id: string; week_number: number; theme: string; emoji: string }[] = []
    const skipped: string[] = []

    for (const line of lines) {
      const isTab = line.includes('\t')
      const parts = (isTab ? line.split('\t') : line.split(',')).map((p) => p.trim())
      const weekNum = parseInt(parts[0] ?? '', 10)

      // Tab-separated (Excel paste) has a clean 3rd column for an explicit
      // emoji override. Comma-separated rejoins everything after the week
      // # as the theme instead -- a theme can itself contain a comma, and
      // splitting positionally on commas would wrongly chop it up.
      let theme: string
      let explicitEmoji: string | undefined
      if (isTab) {
        theme = parts[1] ?? ''
        explicitEmoji = parts[2]
      } else {
        theme = parts.slice(1).join(',').trim()
      }

      if (!weekNum || !theme) {
        skipped.push(line)
        continue
      }

      rows.push({
        season_id: seasonId,
        week_number: weekNum,
        theme,
        emoji: explicitEmoji || suggestThemeEmoji(theme),
      })
    }

    if (rows.length === 0) {
      setBulkResult('Nothing valid to add — expected one row per line: week #, theme.')
      return
    }

    setBulkSaving(true)
    const { error } = await supabase
      .from('season_themes')
      .upsert(rows, { onConflict: 'season_id,week_number' })
    setBulkSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    setBulkResult(
      `Added/updated ${rows.length} theme${rows.length === 1 ? '' : 's'}.` +
        (skipped.length > 0 ? ` Skipped ${skipped.length} line(s) that didn't parse.` : '')
    )
    setBulkText('')
    loadThemes()
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/commissioner" className="text-sm text-muted-foreground hover:underline">
          ← Commissioner Tools
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Season Themes</h1>
        <p className="text-sm text-muted-foreground">
          Plan a theme per week ahead of time. Each one stays hidden from participants until
          picks open for that week — no need for the week to exist yet.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loadingSeasons ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <select
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Add a theme</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="theme-week">Week #</Label>
              <Input
                id="theme-week"
                type="number"
                value={addWeek}
                onChange={(e) => setAddWeek(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label htmlFor="theme-text">Theme</Label>
              <Input
                id="theme-text"
                value={addTheme}
                onChange={(e) => {
                  const value = e.target.value
                  setAddTheme(value)
                  // Keep re-suggesting as they type, until they touch the
                  // emoji field themselves -- at that point their choice
                  // wins and typing more theme text won't overwrite it.
                  if (emojiAutoFilled) setAddEmoji(value.trim() ? suggestThemeEmoji(value) : '')
                }}
                placeholder="e.g. Kickoff Weekend"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="theme-emoji">Emoji</Label>
              <Input
                id="theme-emoji"
                value={addEmoji}
                onChange={(e) => {
                  setAddEmoji(e.target.value)
                  setEmojiAutoFilled(false)
                }}
                placeholder="🎵"
                className="text-center text-lg"
              />
            </div>
          </div>
          <Button onClick={handleAdd} disabled={adding} className="self-start">
            {adding ? 'Saving...' : 'Add theme'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Bulk add the whole season</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            One theme per line: week #, theme, and an optional emoji override — tab or comma
            separated (the emoji column only works with tabs, since a comma-separated theme could
            contain a comma itself). Left off, an emoji is auto-suggested from the theme text.
            Re-pasting a week that already has a theme updates it rather than duplicating.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={'1\tKickoff Weekend\n2\tRivalry Week\t⚔️'}
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
          <CardTitle className="text-base font-medium">Planned themes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingThemes ? (
            <Skeleton className="h-24 w-full" />
          ) : themes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No themes planned for this season yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {themes.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">Week {t.week_number}</span> —{' '}
                    {t.emoji ? `${t.emoji} ` : ''}
                    {t.theme}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)}>
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
