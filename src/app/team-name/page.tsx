'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'

type Identity = {
  id: string
  label: string
  teamName: string
  savedTeamName: string
  saving: boolean
  error: string
}

export default function TeamNamePage() {
  const [loading, setLoading] = useState(true)
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [seasonName, setSeasonName] = useState('')
  const [identities, setIdentities] = useState<Identity[]>([])
  const [pageError, setPageError] = useState('')

  const supabase = createClient()

  const loadData = async () => {
    setLoading(true)
    setPageError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setPageError('Not logged in.')
      setLoading(false)
      return
    }

    const { data: activeSeasons } = await supabase
      .from('seasons')
      .select('id, name')
      .eq('status', 'active')
      .limit(1)

    const season = activeSeasons?.[0]
    if (!season) {
      setPageError('No active season right now — check back once one is live.')
      setLoading(false)
      return
    }
    setSeasonId(season.id)
    setSeasonName(season.name)

    const { data: managed } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('managed_by', user.id)

    const selfAndManaged = [
      { id: user.id, label: 'Your team name' },
      ...(managed ?? []).map((m) => ({ id: m.id, label: `${m.display_name}'s team name` })),
    ]

    const { data: profiles } = await supabase
      .from('season_profiles')
      .select('user_id, team_name')
      .eq('season_id', season.id)
      .in(
        'user_id',
        selfAndManaged.map((i) => i.id)
      )

    const teamNameByUserId = new Map((profiles ?? []).map((p) => [p.user_id, p.team_name]))

    setIdentities(
      selfAndManaged.map((i) => ({
        id: i.id,
        label: i.label,
        teamName: teamNameByUserId.get(i.id) ?? '',
        savedTeamName: teamNameByUserId.get(i.id) ?? '',
        saving: false,
        error: '',
      }))
    )

    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (id: string, value: string) => {
    setIdentities((prev) => prev.map((i) => (i.id === id ? { ...i, teamName: value } : i)))
  }

  const handleSave = async (id: string) => {
    if (!seasonId) return
    const identity = identities.find((i) => i.id === id)
    if (!identity) return

    const trimmed = identity.teamName.trim()
    if (!trimmed) {
      setIdentities((prev) =>
        prev.map((i) => (i.id === id ? { ...i, error: "Team name can't be empty" } : i))
      )
      return
    }

    setIdentities((prev) =>
      prev.map((i) => (i.id === id ? { ...i, saving: true, error: '' } : i))
    )

    const { error } = await supabase
      .from('season_profiles')
      .upsert(
        { user_id: id, season_id: seasonId, team_name: trimmed },
        { onConflict: 'user_id,season_id' }
      )

    setIdentities((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              saving: false,
              error: error ? error.message : '',
              savedTeamName: error ? i.savedTeamName : trimmed,
              teamName: error ? i.teamName : trimmed,
            }
          : i
      )
    )
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Team Name</h1>
        {seasonName && <p className="text-muted-foreground">{seasonName} season</p>}
      </div>

      {pageError && <p className="text-sm text-destructive">{pageError}</p>}

      {identities.map((identity) => (
        <Card key={identity.id}>
          <CardHeader>
            <CardTitle className="text-base font-medium">{identity.label}</CardTitle>
            <CardDescription>
              Shown on standings, picks, and everywhere else this season.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                value={identity.teamName}
                onChange={(e) => handleChange(identity.id, e.target.value)}
                placeholder="e.g. The Buckeye Believers"
              />
              <Button
                onClick={() => handleSave(identity.id)}
                disabled={identity.saving || identity.teamName === identity.savedTeamName}
              >
                {identity.saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
            {identity.error && <p className="text-sm text-destructive">{identity.error}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
