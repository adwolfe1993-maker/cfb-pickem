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
    .select('id, season_year, week_number, theme, spotify_url')
    .order('season_year', { ascending: false })
    .order('week_number', { ascending: true })

  const bySeason = new Map<number, typeof playlists>()
  for (const p of playlists ?? []) {
    if (!bySeason.has(p.season_year)) bySeason.set(p.season_year, [])
    bySeason.get(p.season_year)!.push(p)
  }
  const seasons = [...bySeason.keys()].sort((a, b) => b - a)

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

      {seasons.length === 0 ? (
        <p className="text-sm text-muted-foreground">No playlists have been added yet.</p>
      ) : (
        seasons.map((year) => (
          <Card key={year}>
            <CardHeader>
              <CardTitle className="text-base font-medium">{year} Season</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {bySeason.get(year)!.map((p) => (
                <a
                  key={p.id}
                  href={p.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 py-2 text-sm hover:text-primary"
                >
                  <span>
                    Week {p.week_number}
                    {p.theme ? <span className="text-muted-foreground"> — {p.theme}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">Open in Spotify →</span>
                </a>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
