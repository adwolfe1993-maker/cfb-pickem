'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Season = {
  id: string
  name: string
  core_four_enabled: boolean
  status: 'upcoming' | 'active' | 'complete'
}

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [name, setName] = useState('')
  const [coreFour, setCoreFour] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const supabase = createClient()

  const loadSeasons = async () => {
    const { data, error } = await supabase
      .from('seasons')
      .select('id, name, core_four_enabled, status')
      .order('name', { ascending: false })

    if (error) setError(error.message)
    else setSeasons(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadSeasons()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const { error } = await supabase.from('seasons').insert({
      name,
      core_four_enabled: coreFour,
      status: 'upcoming',
    })

    if (error) {
      setError(error.message)
    } else {
      setName('')
      setCoreFour(false)
      loadSeasons()
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/commissioner" className="text-sm text-muted-foreground hover:underline">
          ← Commissioner Tools
        </Link>
        <h1 className="text-2xl font-semibold">Seasons</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create a Season</CardTitle>
          <CardDescription>
            Core Four is off by default for 2026 and later, per the current rule set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="season-name">Season name</Label>
              <Input
                id="season-name"
                type="text"
                required
                placeholder="e.g. 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="core-four"
                checked={coreFour}
                onCheckedChange={(checked) => setCoreFour(checked === true)}
              />
              <Label htmlFor="core-four" className="font-normal">
                Enable Core Four
              </Label>
            </div>

            <Button type="submit" className="self-start">
              Create Season
            </Button>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Existing Seasons</h2>

        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : seasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No seasons yet — create one above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {seasons.map((s) => (
              <Link
                key={s.id}
                href={`/commissioner/seasons/${s.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-accent"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {s.status}
                    {s.core_four_enabled && ' · Core Four ON'}
                  </p>
                </div>
                <span className="text-muted-foreground">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
