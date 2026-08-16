'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import FootballField from '@/components/FootballField'

type Props = {
  displayName: string
  seasonId: string | null
  seasonName: string
  initialTeamName: string
}

export default function WelcomeFlow({
  displayName: initialDisplayName,
  seasonId,
  seasonName,
  initialTeamName,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [teamName, setTeamName] = useState(initialTeamName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const finish = async (redirectTo: string) => {
    // A user who was already flagged welcomed can't reach this page (the
    // server component redirects them to / first), so this is always a
    // genuine first completion.
    await supabase.rpc('mark_welcomed')
    router.push(redirectTo)
    router.refresh()
  }

  const handleSave = async () => {
    setError('')

    const trimmedName = displayName.trim()
    if (!trimmedName) {
      setError("Display name can't be empty")
      return
    }

    setSaving(true)

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData.user?.id

    if (!userId) {
      setError('Not logged in — try refreshing the page.')
      setSaving(false)
      return
    }

    const { error: nameError } = await supabase.rpc('update_display_name', {
      p_user_id: userId,
      p_display_name: trimmedName,
    })

    if (nameError) {
      setError(nameError.message)
      setSaving(false)
      return
    }

    const trimmedTeam = teamName.trim()
    if (seasonId && trimmedTeam) {
      const { error: teamError } = await supabase
        .from('season_profiles')
        .upsert(
          { user_id: userId, season_id: seasonId, team_name: trimmedTeam },
          { onConflict: 'user_id,season_id' }
        )

      if (teamError) {
        setError(teamError.message)
        setSaving(false)
        return
      }
    }

    await finish('/')
  }

  const handleSkip = async () => {
    setSaving(true)
    await finish('/')
  }

  return (
    <div className="relative flex flex-1 items-center justify-center p-4">
      <FootballField />

      <Card className="relative z-10 w-full max-w-md shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to The Buck Stops Here!</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 text-sm">
          <p className="text-muted-foreground">
            Two quick things before you start picking. Both of these show up everywhere —
            standings, the pick grid, weekly emails — so it&apos;s worth a minute now. You can
            always change them later from <span className="font-medium text-foreground">Profile</span>{' '}
            in the menu.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="display-name">Your name</Label>
            <p className="text-xs text-muted-foreground">
              Shown next to your picks and in the standings, so the group knows it&apos;s you.
            </p>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Andrew"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="team-name">
              Team name{seasonName ? ` — ${seasonName}` : ''}
            </Label>
            <p className="text-xs text-muted-foreground">
              {seasonId
                ? "Your fun league name for this season. Doesn't need to be permanent — pick something now and change it anytime."
                : 'No season is set up yet — you can add a team name once one is.'}
            </p>
            <Input
              id="team-name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. The Buckeye Believers"
              disabled={!seasonId}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row-reverse">
            <Button onClick={handleSave} disabled={saving} className="sm:flex-1">
              {saving ? 'Saving...' : 'Save & Continue'}
            </Button>
            <Button variant="ghost" onClick={handleSkip} disabled={saving}>
              Skip for now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
