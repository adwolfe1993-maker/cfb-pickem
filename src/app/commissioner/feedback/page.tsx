'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

type FeedbackItem = {
  id: string
  message: string
  status: 'open' | 'resolved'
  created_at: string
  display_name: string | null
}

export default function CommissionerFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const supabase = createClient()

  const loadFeedback = async () => {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, message, status, created_at, user:user_id(display_name)')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setItems(
        (data ?? []).map((row) => ({
          id: row.id,
          message: row.message,
          status: row.status,
          created_at: row.created_at,
          display_name:
            (row.user as unknown as { display_name: string } | null)?.display_name ?? null,
        }))
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    loadFeedback()
  }, [])

  const toggleStatus = async (item: FeedbackItem) => {
    setUpdatingId(item.id)
    setError('')

    const { error } = await supabase
      .from('feedback')
      .update({ status: item.status === 'open' ? 'resolved' : 'open' })
      .eq('id', item.id)

    if (error) setError(error.message)
    else loadFeedback()

    setUpdatingId(null)
  }

  const openItems = items.filter((i) => i.status === 'open')
  const resolvedItems = items.filter((i) => i.status === 'resolved')

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/commissioner" className="text-sm text-muted-foreground hover:underline">
          ← Commissioner Tools
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Feedback</h1>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Open ({openItems.length})</h2>
            {openItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing open right now.</p>
            ) : (
              openItems.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex items-start justify-between gap-4 py-4">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm">{item.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.display_name ?? 'Unknown'} ·{' '}
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === item.id}
                      onClick={() => toggleStatus(item)}
                    >
                      {updatingId === item.id ? 'Saving...' : 'Mark Resolved'}
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {resolvedItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">Resolved ({resolvedItems.length})</h2>
              {resolvedItems.map((item) => (
                <Card key={item.id} className="opacity-60">
                  <CardContent className="flex items-start justify-between gap-4 py-4">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm">{item.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.display_name ?? 'Unknown'} ·{' '}
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">Resolved</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updatingId === item.id}
                        onClick={() => toggleStatus(item)}
                      >
                        Reopen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
