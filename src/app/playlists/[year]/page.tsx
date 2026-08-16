import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function PlaylistYearPage({
  params,
}: {
  params: Promise<{ year: string }>
}) {
  const { year: yearParam } = await params
  const year = parseInt(yearParam, 10)

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  if (!year) {
    notFound()
  }

  const { data: playlists } = await supabase
    .from('playlists')
    .select('id, week_number, theme, emoji, spotify_url')
    .eq('season_year', year)
    .order('week_number', { ascending: true })

  if (!playlists || playlists.length === 0) {
    notFound()
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/playlists" className="text-sm text-muted-foreground hover:underline">
          ← All Seasons
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{year} Season</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Weekly playlists</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {playlists.map((p) => (
            <a
              key={p.id}
              href={p.spotify_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 py-2 text-sm hover:text-primary"
            >
              <span>
                Week {p.week_number}
                {p.theme ? (
                  <span className="text-muted-foreground">
                    {' '}
                    — {p.emoji ? `${p.emoji} ` : ''}
                    {p.theme}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">Open in Spotify →</span>
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
