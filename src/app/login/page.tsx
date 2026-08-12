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
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

// Supabase error objects normally have a real string `.message`, but
// nothing guarantees that upstream — a malformed hook response, an
// unexpected shape from GoTrue, or a thrown network error could all
// leave `.message` empty or missing. Rather than trust that field blindly
// (setErrorMsg(error.message) would literally render the text "undefined"
// if it were ever undefined), fall back to a clear generic message.
function getAuthErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim().length > 0) {
      return msg
    }
  }
  return 'Something went wrong signing in. Please try again, or contact the commissioner if it keeps happening.'
}

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Still set for anyone who taps the link instead of entering the
          // code (e.g. on desktop or Android, where this actually works).
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        setErrorMsg(getAuthErrorMessage(error))
      } else {
        setStep('code')
      }
    } catch (err) {
      // A thrown exception (e.g. a genuine network failure) skips the
      // {error} branch above entirely — without this, the button would
      // stay stuck on "Sending..." forever with no explanation.
      setErrorMsg(getAuthErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')

    try {
      const supabase = createClient()
      // Verifying via the emailed 8-digit code — this completes sign-in in
      // whatever browsing context the person is already in (critically,
      // including an installed iOS home-screen PWA, which the link-tap flow
      // can't reach since iOS gives installed PWAs a separate storage
      // context from Safari).
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      })

      if (error) {
        setErrorMsg(getAuthErrorMessage(error))
      } else {
        router.push('/')
        router.refresh()
      }
    } catch (err) {
      setErrorMsg(getAuthErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">The Buck Stops Here</CardTitle>
          <CardDescription>No excuses. Just picks.</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'email' ? (
            <form onSubmit={handleSendCode} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Sending...' : 'Send Sign-In Code'}
              </Button>
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Check your email for an 8-digit code and enter it below.
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  placeholder="12345678"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                />
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Verifying...' : 'Verify Code'}
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => {
                  setStep('email')
                  setCode('')
                  setErrorMsg('')
                }}
              >
                Use a different email
              </button>
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
