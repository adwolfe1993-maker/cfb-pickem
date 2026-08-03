'use client'

import { useEffect, useState } from 'react'
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

type Participant = {
  id: string
  display_name: string
  email: string
}

export default function InviteParticipantPage() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const supabase = createClient()

  const loadParticipants = async () => {
    // Only independent accounts — managed profiles have their own page
    // and would be confusing mixed into this list.
    const { data, error } = await supabase
      .from('users')
      .select('id, display_name, email')
      .is('managed_by', null)
      .order('display_name', { ascending: true })

    if (error) setError(error.message)
    else setParticipants(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadParticipants()
  }, [])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    setError('')
    setSuccessMsg('')

    const { data, error: fnError } = await supabase.functions.invoke('invite-participant', {
      body: { email, displayName },
    })

    if (fnError) {
      const context = (fnError as unknown as { context?: Response }).context
      const body = context ? await context.json().catch(() => null) : null
      setError(body?.error ?? fnError.message)
    } else if (data?.error) {
      setError(data.error)
    } else {
      setSuccessMsg(
        data?.invite_email_sent
          ? `Invited "${displayName}" — sign-in code sent to ${email}.`
          : `Created "${displayName}", but the sign-in email failed to send (${data?.invite_email_error ?? 'unknown error'}). They can still request a code themselves at login.`
      )
      setEmail('')
      setDisplayName('')
      loadParticipants()
    }

    setInviting(false)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <h1 className="text-2xl font-semibold">Invite a Participant</h1>
      <p className="text-sm text-muted-foreground">
        Creates the account and sends them a real sign-in code right away — this is the only
        way new accounts get created. Public self-registration is disabled.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New Invite</CardTitle>
          <CardDescription>Their real email — this is what they&apos;ll log in with.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="someone@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-name">Display name</Label>
              <Input
                id="invite-name"
                required
                placeholder="e.g. Hannah"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={inviting} className="self-start">
              {inviting ? 'Inviting...' : 'Send Invite'}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {successMsg && <p className="text-sm text-green-700">{successMsg}</p>}
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Current Participants ({participants.length})</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          participants.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-4">
              <p className="font-medium">{p.display_name}</p>
              <p className="text-xs text-muted-foreground">{p.email}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
