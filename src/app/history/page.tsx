import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type StandingRow = {
  year: number
  team_name: string | null
  net_score: number
  rank: number
  conf_title_score: number | null
  historical_players: { canonical_name: string; user_id: string | null } | null
}

export default async function HistoryIndexPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: seasons } = await supabase
    .from('historical_seasons')
    .select('year, weeks_played, had_conference_title')
    .order('year', { ascending: false })

  const { data: standingsData } = await supabase
    .from('historical_standings')
    .select(
      'year, team_name, net_score, rank, conf_title_score, historical_players(canonical_name, user_id)'
    )
    .order('year', { ascending: false })
    .order('rank', { ascending: true })

  const standings = (standingsData ?? []) as unknown as StandingRow[]

  const byYear = new Map<number, StandingRow[]>()
  for (const s of standings) {
    if (!byYear.has(s.year)) byYear.set(s.year, [])
    byYear.get(s.year)!.push(s)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">League History</h1>
        <p className="text-sm text-muted-foreground">
          Every season since 2020 — final standings, Bonus Team picks, and Win the Week
          results, pulled from the original workbooks.
        </p>
      </div>

      <Link
        href="/history/career"
        className="rounded-lg border border-primary bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10"
      >
        View All-Time Career Stats →
      </Link>

      <div className="flex flex-col gap-3">
        {(seasons ?? []).map((season) => {
          const rows = byYear.get(season.year) ?? []
          const overallChamp = rows.find((r) => r.rank === 1)

          // Regular season champion: highest (net_score - conf_title_score).
          // When conf_title_score is null (2020, and 2021 where Conference
          // Titles was tracked but every score was 0), this is identical to
          // the overall champion.
          let regSeasonChamp: StandingRow | undefined
          let regSeasonNet = -Infinity
          for (const r of rows) {
            const net = r.net_score - (r.conf_title_score ?? 0)
            if (net > regSeasonNet) {
              regSeasonNet = net
              regSeasonChamp = r
            }
          }

          const samePerson =
            overallChamp?.historical_players?.canonical_name ===
            regSeasonChamp?.historical_players?.canonical_name

          const renderChamp = (c: StandingRow | undefined) =>
            c ? (
              c.team_name ? (
                <>
                  {c.team_name}{' '}
                  <span className="text-muted-foreground">
                    ({c.historical_players?.canonical_name})
                  </span>
                </>
              ) : (
                c.historical_players?.canonical_name
              )
            ) : null

          return (
            <Card key={season.year} className="relative transition-colors hover:bg-accent">
              <Link
                href={`/history/${season.year}`}
                className="absolute inset-0"
                aria-label={`${season.year} Season`}
              />
              <CardHeader>
                <CardTitle className="text-base font-medium">{season.year} Season</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">
                  {rows.length} participant{rows.length === 1 ? '' : 's'}
                  {season.had_conference_title ? ' · Conf. Title Week' : ''}
                </span>
                {samePerson ? (
                  <span className="font-medium">🏆 {renderChamp(overallChamp)}</span>
                ) : (
                  <>
                    <span className="font-medium">🏆 Overall: {renderChamp(overallChamp)}</span>
                    <span className="text-xs text-muted-foreground">
                      🎖️ Regular Season: {renderChamp(regSeasonChamp)}
                    </span>
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
