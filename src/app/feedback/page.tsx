'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function FeedbackPage() {
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('You must be logged in.')
      setSubmitting(false)
      return
    }

    const { error } = await supabase
      .from('feedback')
      .insert({ user_id: user.id, message: message.trim() })

    if (error) {
      setError(error.message)
    } else {
      setSubmitted(true)
    }

    setSubmitting(false)
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Report a Problem</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What happened?</CardTitle>
          <CardDescription>
            Describe what you were doing and what went wrong — as much detail as you can. This
            goes straight to Andrew.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <p className="text-sm text-green-700">
              Got it — thanks for the report. Feel free to submit another if you run into
              something else.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <textarea
                required
                rows={6}
                placeholder="e.g. When I tried to submit my pick for the Ohio State game, nothing happened when I tapped the team name."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <Button type="submit" disabled={submitting} className="self-start">
                {submitting ? 'Sending...' : 'Send Report'}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
