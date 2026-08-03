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

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Still set for anyone who taps the link instead of entering the
        // code (e.g. on desktop or Android, where this actually works).
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setSubmitting(false)
    if (error) {
      setErrorMsg(error.message)
    } else {
      setStep('code')
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')

    const supabase = createClient()
    // Verifying via the emailed 6-digit code — this completes sign-in in
    // whatever browsing context the person is already in (critically,
    // including an installed iOS home-screen PWA, which the link-tap flow
    // can't reach since iOS gives installed PWAs a separate storage
    // context from Safari).
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })

    setSubmitting(false)
    if (error) {
      setErrorMsg(error.message)
    } else {
      router.push('/')
      router.refresh()
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
                Check your email for a 6-digit code and enter it below.
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
