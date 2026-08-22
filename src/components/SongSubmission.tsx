'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  weekId: string
  userId: string
  weekStatus: string
}

const ARTIST_EASTER_EGGS: { patterns: string[]; line: string }[] = [
  { patterns: ['taylor swift'], line: 'This song will never go out of style.' },
  { patterns: ['kanye west', 'kanye'], line: 'And I always find something wrong.' },
  { patterns: ['dua lipa'], line: "Training Season's over, but this week has just begun." },
  { patterns: ['maggie rogers'], line: "We'll leave the light on for good picks." },
  { patterns: ['the band'], line: 'Take a load off, Fanny — and take the points too.' },
  { patterns: ['beatles'], line: 'Let it be... your Bonus Team pick.' },
  { patterns: ['kendrick lamar', 'kendrick'], line: 'Sit down. Be humble. Pick better.' },
  { patterns: ['kesha', 'ke$ha'], line: 'Man, I love Ke$ha!' },
  { patterns: ['fetty wap', 'fetty'], line: '1738, YA.' },
  { patterns: ['olivia rodrigo'], line: 'Bored in bed, making perfect picks instead.' },
]

function findArtistEasterEgg(song: string): string | null {
  const normalized = song.toLowerCase().replace(/\$/g, 's')
  for (const { patterns, line } of ARTIST_EASTER_EGGS) {
    if (patterns.some((p) => normalized.includes(p.replace(/\$/g, 's')))) {
      return line
    }
  }
  return null
}

export default function SongSubmission({ weekId, userId, weekStatus }: Props) {
  const [song, setSong] = useState('')
  const [savedSong, setSavedSong] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [artistMessage, setArtistMessage] = useState<string | null>(null)

  const supabase = createClient()
  const isOpen = weekStatus === 'active'

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      const { data } = await supabase
        .from('song_submissions')
        .select('song')
        .eq('user_id', userId)
        .eq('week_id', weekId)
        .maybeSingle()

      if (!cancelled) {
        setSong(data?.song ?? '')
        setSavedSong(data?.song ?? '')
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId, userId])

  const handleSave = async () => {
    setError('')
    const trimmed = song.trim()

    if (!trimmed) {
      if (savedSong) {
        setSaving(true)
        const { error: delError } = await supabase
          .from('song_submissions')
          .delete()
          .eq('user_id', userId)
          .eq('week_id', weekId)
        setSaving(false)
        if (delError) {
          setError(delError.message)
          return
        }
        setSavedSong('')
      }
      return
    }

    setSaving(true)
    const { error: upsertError } = await supabase
      .from('song_submissions')
      .upsert(
        { user_id: userId, week_id: weekId, song: trimmed, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,week_id' }
      )
    setSaving(false)

    if (upsertError) {
      setError(upsertError.message)
      return
    }
    setSavedSong(trimmed)

    const line = findArtistEasterEgg(trimmed)
    if (line) {
      setArtistMessage(line)
      setTimeout(() => setArtistMessage(null), 3200)
    }
  }

  if (loading) return null

  return (
    <Card>
      {artistMessage && (
        <div className="fixed left-1/2 top-[16%] z-[10000] -translate-x-1/2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-opacity">
          {artistMessage}
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-base font-medium">🎵 Song for this week&apos;s playlist</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Optional — suggest a song and the commissioner will fold it into this week&apos;s
          playlist. Editable any time while the week is open.
        </p>

        {!isOpen ? (
          <p className="text-sm text-muted-foreground">
            {savedSong ? (
              <>
                You submitted <span className="font-medium text-foreground">{savedSong}</span> —
                this week is closed, so it&apos;s locked in.
              </>
            ) : (
              'This week is closed — song submissions are no longer open.'
            )}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="song-submission">Artist – Song title</Label>
              <div className="flex gap-2">
                <Input
                  id="song-submission"
                  value={song}
                  onChange={(e) => setSong(e.target.value)}
                  placeholder="e.g. Tom Petty – Free Fallin'"
                />
                <Button onClick={handleSave} disabled={saving || song.trim() === savedSong}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
