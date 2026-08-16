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

export default function SongSubmission({ weekId, userId, weekStatus }: Props) {
  const [song, setSong] = useState('')
  const [savedSong, setSavedSong] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      // Empty save = withdraw a submission, not an error.
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
  }

  if (loading) return null

  return (
    <Card>
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
