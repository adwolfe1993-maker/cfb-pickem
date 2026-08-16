'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { getCurrentSeason } from '@/utils/currentSeason'
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

type Identity = {
  id: string
  label: string
  displayName: string
  savedDisplayName: string
  teamName: string
  savedTeamName: string
  savingName: boolean
  savingTeam: boolean
  nameError: string
  teamError: string
}

export default function ProfilePage() {
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

    const [managedRes, selfRes] = await Promise.all([
      supabase.from('users').select('id, display_name').eq('managed_by', user.id),
      supabase.from('users').select('id, display_name').eq('id', user.id).single(),
    ])

    const allIdentities = [
      { id: user.id, label: 'You', displayName: selfRes.data?.display_name ?? '' },
      ...(managedRes.data ?? []).map((m) => ({
        id: m.id,
        label: m.display_name,
        displayName: m.display_name,
      })),
    ]

    // Active, else the most recently created upcoming season — so team
    // names can be set up ahead of the season officially going active,
    // not just once it's already underway.
    const season = await getCurrentSeason(supabase)
    setSeasonId(season?.id ?? null)
    setSeasonName(season?.name ?? '')

    let teamNameByUserId = new Map<string, string>()
    if (season) {
      const { data: profiles } = await supabase
        .from('season_profiles')
        .select('user_id, team_name')
        .eq('season_id', season.id)
        .in(
          'user_id',
          allIdentities.map((i) => i.id)
        )
      teamNameByUserId = new Map((profiles ?? []).map((p) => [p.user_id, p.team_name]))
    }

    setIdentities(
      allIdentities.map((i) => ({
        id: i.id,
        label: i.label,
        displayName: i.displayName,
        savedDisplayName: i.displayName,
        teamName: teamNameByUserId.get(i.id) ?? '',
        savedTeamName: teamNameByUserId.get(i.id) ?? '',
        savingName: false,
        savingTeam: false,
        nameError: '',
        teamError: '',
      }))
    )

    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNameChange = (id: string, value: string) => {
    setIdentities((prev) => prev.map((i) => (i.id === id ? { ...i, displayName: value } : i)))
  }

  const handleTeamChange = (id: string, value: string) => {
    setIdentities((prev) => prev.map((i) => (i.id === id ? { ...i, teamName: value } : i)))
  }

  const handleSaveName = async (id: string) => {
    const identity = identities.find((i) => i.id === id)
    if (!identity) return

    const trimmed = identity.displayName.trim()
    if (!trimmed) {
      setIdentities((prev) =>
        prev.map((i) => (i.id === id ? { ...i, nameError: "Name can't be empty" } : i))
      )
      return
    }

    setIdentities((prev) =>
      prev.map((i) => (i.id === id ? { ...i, savingName: true, nameError: '' } : i))
    )

    const { error } = await supabase.rpc('update_display_name', {
      p_user_id: id,
      p_display_name: trimmed,
    })

    setIdentities((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              savingName: false,
              nameError: error ? error.message : '',
              savedDisplayName: error ? i.savedDisplayName : trimmed,
              displayName: error ? i.displayName : trimmed,
            }
          : i
      )
    )
  }

  const handleSaveTeam = async (id: string) => {
    if (!seasonId) return
    const identity = identities.find((i) => i.id === id)
    if (!identity) return

    const trimmed = identity.teamName.trim()
    if (!trimmed) {
      setIdentities((prev) =>
        prev.map((i) => (i.id === id ? { ...i, teamError: "Team name can't be empty" } : i))
      )
      return
    }

    setIdentities((prev) =>
      prev.map((i) => (i.id === id ? { ...i, savingTeam: true, teamError: '' } : i))
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
              savingTeam: false,
              teamError: error ? error.message : '',
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
        <h1 className="mt-1 text-2xl font-semibold">Profile</h1>
      </div>

      {pageError && <p className="text-sm text-destructive">{pageError}</p>}

      {identities.map((identity) => (
        <Card key={identity.id}>
          <CardHeader>
            <CardTitle className="text-base font-medium">{identity.label}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`name-${identity.id}`}>Display name</Label>
              <div className="flex gap-2">
                <Input
                  id={`name-${identity.id}`}
                  value={identity.displayName}
                  onChange={(e) => handleNameChange(identity.id, e.target.value)}
                />
                <Button
                  onClick={() => handleSaveName(identity.id)}
                  disabled={
                    identity.savingName || identity.displayName === identity.savedDisplayName
                  }
                >
                  {identity.savingName ? 'Saving...' : 'Save'}
                </Button>
              </div>
              {identity.nameError && (
                <p className="text-sm text-destructive">{identity.nameError}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`team-${identity.id}`}>
                Team name{seasonName ? ` (${seasonName})` : ''}
              </Label>
              {seasonId ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      id={`team-${identity.id}`}
                      value={identity.teamName}
                      onChange={(e) => handleTeamChange(identity.id, e.target.value)}
                      placeholder="e.g. The Buckeye Believers"
                    />
                    <Button
                      onClick={() => handleSaveTeam(identity.id)}
                      disabled={
                        identity.savingTeam || identity.teamName === identity.savedTeamName
                      }
                    >
                      {identity.savingTeam ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                  {identity.teamError && (
                    <p className="text-sm text-destructive">{identity.teamError}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active season right now — team name will be available once one starts.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
