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

type AllowedEmail = {
  email: string
  default_display_name: string | null
  created_at: string
}

export default function InviteParticipantPage() {
  const [allowed, setAllowed] = useState<AllowedEmail[]>([])
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removingEmail, setRemovingEmail] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const supabase = createClient()

  const loadAllowed = async () => {
    const { data, error } = await supabase
      .from('allowed_emails')
      .select('email, default_display_name, created_at')
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setAllowed(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadAllowed()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true)
    setError('')
    setSuccessMsg('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.from('allowed_emails').insert({
      email: email.trim().toLowerCase(),
      default_display_name: displayName.trim(),
      invited_by: user?.id,
    })

    if (error) {
      setError(error.code === '23505' ? 'That email is already on the list.' : error.message)
    } else {
      setSuccessMsg(
        `${displayName} can now sign in — send them the link whenever you're ready. They'll see "Welcome, ${displayName}!" the first time they log in.`
      )
      setEmail('')
      setDisplayName('')
      loadAllowed()
    }

    setAdding(false)
  }

  const handleRemove = async (emailToRemove: string) => {
    setRemovingEmail(emailToRemove)
    setError('')

    const { error } = await supabase
      .from('allowed_emails')
      .delete()
      .eq('email', emailToRemove)

    if (error) setError(error.message)
    else loadAllowed()

    setRemovingEmail(null)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <Link href="/commissioner" className="text-sm text-muted-foreground hover:underline">
        ← Commissioner Tools
      </Link>
      <h1 className="text-2xl font-semibold">Invite a Participant</h1>
      <p className="text-sm text-muted-foreground">
        Add their email here, then just send them the site link — they enter their own email
        to log in and set up their own profile. Public self-registration is otherwise blocked;
        only addresses on this list can sign in.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add an Email</CardTitle>
          <CardDescription>
            Their real email, and the name they&apos;ll be welcomed by on first login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
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
                placeholder="e.g. Jake"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={adding} className="self-start">
              {adding ? 'Adding...' : 'Add to Allowlist'}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          {successMsg && <p className="mt-2 text-sm text-green-700">{successMsg}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Allowed to Sign In ({allowed.length})</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : allowed.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet — add one above.</p>
        ) : (
          allowed.map((a) => (
            <div
              key={a.email}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div>
                <p className="font-medium">{a.default_display_name ?? a.email}</p>
                <p className="text-xs text-muted-foreground">{a.email}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={removingEmail === a.email}
                onClick={() => handleRemove(a.email)}
              >
                {removingEmail === a.email ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
