import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function PlaylistsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: playlists } = await supabase
    .from('playlists')
    .select('season_year')
    .order('season_year', { ascending: false })

  const yearCounts = new Map<number, number>()
  for (const p of playlists ?? []) {
    yearCounts.set(p.season_year, (yearCounts.get(p.season_year) ?? 0) + 1)
  }
  const years = [...yearCounts.keys()].sort((a, b) => b - a)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Weekly Playlists</h1>
        <p className="text-sm text-muted-foreground">
          Every playlist the league has built, season by season.
        </p>
      </div>

      {years.length === 0 ? (
        <p className="text-sm text-muted-foreground">No playlists have been added yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {years.map((year) => (
            <Card key={year} className="relative transition-colors hover:bg-accent">
              <Link href={`/playlists/${year}`} className="absolute inset-0" aria-label={`${year} Season`} />
              <CardHeader>
                <CardTitle className="text-base font-medium">{year} Season</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {yearCounts.get(year)} playlist{yearCounts.get(year) === 1 ? '' : 's'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
