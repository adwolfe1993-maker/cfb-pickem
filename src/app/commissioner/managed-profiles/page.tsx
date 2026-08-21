'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type ManagedProfile = {
  id: string
  display_name: string
  email: string
  managed_by: string
  manager_display_name: string | null
}

export default function ManagedProfilesPage() {
  const [profiles, setProfiles] = useState<ManagedProfile[]>([])
  const [managingUserEmail, setManagingUserEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [syntheticEmail, setSyntheticEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const supabase = createClient()

  const loadProfiles = async () => {
    // Self-join: managed profiles alongside the display name of whoever
    // manages them, so the list is actually readable (not just raw ids).
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name, email, managed_by, manager:managed_by(display_name)')
      .not('managed_by', 'is', null)

    if (error) {
      setError(error.message)
    } else {
      setProfiles(
        (data ?? []).map((row) => ({
          id: row.id,
          display_name: row.display_name,
          email: row.email,
          managed_by: row.managed_by,
          manager_display_name:
            (row.manager as unknown as { display_name: string } | null)?.display_name ?? null,
        }))
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    setSuccessMsg('')

    const { data, error: fnError } = await supabase.functions.invoke('create-managed-profile', {
      body: { managingUserEmail, displayName, syntheticEmail },
    })

    if (fnError) {
      // Edge Function errors land in fnError but the actual message is in
      // the response body, not fnError.message — have to dig it out.
      const context = (fnError as unknown as { context?: Response }).context
      const body = context ? await context.json().catch(() => null) : null
      setError(body?.error ?? fnError.message)
    } else if (data?.error) {
      setError(data.error)
    } else {
      setSuccessMsg(`Created "${displayName}" — managed by ${managingUserEmail}.`)
      setManagingUserEmail('')
      setDisplayName('')
      setSyntheticEmail('')
      loadProfiles()
    }

    setCreating(false)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <Link href="/commissioner" className="text-sm text-muted-foreground hover:underline">
        ← Commissioner Tools
      </Link>
      <h1 className="text-2xl font-semibold">Managed Profiles</h1>
      <p className="text-sm text-muted-foreground">
        For participants who share an inbox with someone else and can&apos;t get their own
        sign-in code, like a shared household email. The account below logs in normally and
        picks up an extra profile to switch into, so the managed person doesn&apos;t need a
        separate login.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create a Managed Profile</CardTitle>
          <CardDescription>
            Requires an existing account for the person who will do the logging in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="managing-email">Managing user&apos;s email (logs in normally)</Label>
              <Input
                id="managing-email"
                type="email"
                required
                placeholder="grandpa@aol.com"
                value={managingUserEmail}
                onChange={(e) => setManagingUserEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="display-name">Display name for the managed profile</Label>
              <Input
                id="display-name"
                required
                placeholder="Grandma"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="synthetic-email">
                Placeholder email (unique, never checked — used only to satisfy account
                requirements)
              </Label>
              <Input
                id="synthetic-email"
                type="email"
                required
                placeholder="thebuckstopshereapp+grandma@gmail.com"
                value={syntheticEmail}
                onChange={(e) => setSyntheticEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={creating} className="self-start">
              {creating ? 'Creating...' : 'Create Managed Profile'}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {successMsg && <p className="text-sm text-green-700">{successMsg}</p>}
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Existing Managed Profiles</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          profiles.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-4">
              <p className="font-medium">{p.display_name}</p>
              <p className="text-xs text-muted-foreground">
                Managed by {p.manager_display_name ?? p.managed_by}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
