'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
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

type Season = {
  id: string
  name: string
}

type Week = {
  id: string
  name: string
  week_number: number
  status: 'upcoming' | 'active' | 'complete'
}

export default function SeasonDetailPage({
  params,
}: {
  params: Promise<{ seasonId: string }>
}) {
  const { seasonId } = use(params)
  const [season, setSeason] = useState<Season | null>(null)
  const [weeks, setWeeks] = useState<Week[]>([])
  const [name, setName] = useState('')
  const [weekNumber, setWeekNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const supabase = createClient()

  const loadData = async () => {
    const [seasonRes, weeksRes] = await Promise.all([
      supabase.from('seasons').select('id, name').eq('id', seasonId).single(),
      supabase
        .from('weeks')
        .select('id, name, week_number, status')
        .eq('season_id', seasonId)
        .order('week_number', { ascending: true }),
    ])

    if (seasonRes.error) setError(seasonRes.error.message)
    else setSeason(seasonRes.data)

    if (weeksRes.error) setError(weeksRes.error.message)
    else setWeeks(weeksRes.data ?? [])

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [seasonId])

  const handleCreateWeek = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const { error } = await supabase.from('weeks').insert({
      season_id: seasonId,
      name,
      week_number: Number(weekNumber),
      status: 'upcoming',
    })

    if (error) {
      setError(error.message)
    } else {
      setName('')
      setWeekNumber('')
      loadData()
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 py-12">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/commissioner/seasons" className="text-sm text-muted-foreground hover:underline">
          ← All Seasons
        </Link>
        <h1 className="text-2xl font-semibold">{season?.name} Season</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create a Week</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateWeek} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="week-name">Week name</Label>
              <Input
                id="week-name"
                required
                placeholder="e.g. Week 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="week-number">Week #</Label>
              <Input
                id="week-number"
                type="number"
                required
                min={1}
                max={15}
                className="w-24"
                placeholder="1"
                value={weekNumber}
                onChange={(e) => setWeekNumber(e.target.value)}
              />
            </div>
            <Button type="submit">Create Week</Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Weeks</h2>
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No weeks yet — create one above.</p>
        ) : (
          weeks.map((w) => (
            <Link
              key={w.id}
              href={`/commissioner/seasons/${seasonId}/weeks/${w.id}`}
              className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-accent"
            >
              <div>
                <p className="font-medium">{w.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{w.status}</p>
              </div>
              <span className="text-muted-foreground">→</span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
