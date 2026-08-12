'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/client'

const VAPID_PUBLIC_KEY =
  'BE5PZPg6OHwGRcyCBaqDlKDMEnzT4vNpA3xUEYNSuxmqpCZbAR4mQ4uEpGei0Rmqk9607eNUwKMJ5Z4gALjY79w'

// Push subscription keys arrive base64url-encoded; the browser's
// PushManager.subscribe() call needs them as a raw Uint8Array instead.
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export default function EnableNotifications() {
  const [status, setStatus] = useState<
    'checking' | 'enabled' | 'disabled' | 'unsupported' | 'ios-not-installed'
  >('checking')
  const [error, setError] = useState('')

  useEffect(() => {
    checkStatus()
  }, [])

  async function checkStatus() {
    // iOS only exposes push to an installed (Add to Home Screen) PWA —
    // from inside Safari itself, Notification.requestPermission()/
    // pushManager.subscribe() either fail outright or behave
    // inconsistently. Detect that case specifically and point the person
    // at the actual fix (install first) instead of letting them hit a
    // confusing generic failure from the button below.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true

    if (isIOS && !isStandalone) {
      setStatus('ios-not-installed')
      return
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    setStatus(sub ? 'enabled' : 'disabled')
  }

  async function handleEnable() {
    setError('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Notification permission was not granted.')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const subJson = sub.toJSON()
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError('You must be logged in to enable notifications.')
        return
      }

      const { error: dbError } = await supabase.from('push_subscriptions').insert({
        user_id: user.id,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
      })

      if (dbError) {
        setError(dbError.message)
        return
      }

      setStatus('enabled')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable notifications')
    }
  }

  if (status === 'checking') return null
  if (status === 'unsupported') {
    return (
      <p className="text-xs text-muted-foreground">
        Push notifications aren&apos;t supported in this browser.
      </p>
    )
  }
  if (status === 'ios-not-installed') {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/50 p-3">
        <p className="text-xs font-medium">Get pick reminders on your phone</p>
        <p className="text-xs text-muted-foreground">
          On iPhone, notifications only work once the app is added to your Home Screen.
          Tap the Share icon in Safari, then &quot;Add to Home Screen&quot; — open it from
          there and this will let you turn notifications on.
        </p>
      </div>
    )
  }
  if (status === 'enabled') {
    return <p className="text-xs text-muted-foreground">✅ Notifications enabled</p>
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/50 p-3">
      <p className="text-xs font-medium">Get pick reminders on your phone</p>
      <p className="text-xs text-muted-foreground">
        Missed picks score zero, no exceptions — notifications are how you&apos;ll know when
        picks open and when kickoff is close.
      </p>
      <Button size="sm" onClick={handleEnable} className="mt-1 self-start">
        Enable Notifications
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
