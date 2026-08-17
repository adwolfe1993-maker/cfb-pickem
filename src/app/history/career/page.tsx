import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

type StandingRow = {
  net_score: number
  rank: number
  historical_players: { id: string; canonical_name: string; user_id: string | null } | null
}

type CareerStat = {
  playerId: string
  name: string
  userId: string | null
  seasons: number
  careerNet: number
  championships: number
  weeksWon: number
  dnCorrect: number
  dnTotal: number
}

export default async function CareerStatsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: standingsData } = await supabase
    .from('historical_standings')
    .select('net_score, rank, historical_players(id, canonical_name, user_id)')

  const standings = (standingsData ?? []) as unknown as StandingRow[]

  const { data: wtwData } = await supabase
    .from('historical_win_the_week')
    .select('historical_player_id')

  const { data: dnData } = await supabase
    .from('historical_dn_picks')
    .select('historical_player_id, was_correct')
    .eq('is_conference_title', false)
    .not('was_correct', 'is', null)

  const statsById = new Map<string, CareerStat>()

  for (const s of standings) {
    const p = s.historical_players
    if (!p) continue
    if (!statsById.has(p.id)) {
      statsById.set(p.id, {
        playerId: p.id,
        name: p.canonical_name,
        userId: p.user_id,
        seasons: 0,
        careerNet: 0,
        championships: 0,
        weeksWon: 0,
        dnCorrect: 0,
        dnTotal: 0,
      })
    }
    const stat = statsById.get(p.id)!
    stat.seasons += 1
    stat.careerNet += s.net_score
    if (s.rank === 1) stat.championships += 1
  }

  for (const w of wtwData ?? []) {
    const stat = statsById.get(w.historical_player_id)
    if (stat) stat.weeksWon += 1
  }

  for (const d of dnData ?? []) {
    const stat = statsById.get(d.historical_player_id)
    if (!stat) continue
    stat.dnTotal += 1
    if (d.was_correct) stat.dnCorrect += 1
  }

  const rows = [...statsById.values()].sort((a, b) => {
    if (b.championships !== a.championships) return b.championships - a.championships
    return b.careerNet - a.careerNet
  })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/history" className="text-sm text-muted-foreground hover:underline">
          ← League History
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">All-Time Career Stats</h1>
        <p className="text-sm text-muted-foreground">
          Aggregated across every season since 2020. Ranked by championships, then career
          net score.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-0 divide-y divide-border pt-6">
          {rows.map((r, i) => {
            const isYou = r.userId === user.id
            const dnRate = r.dnTotal > 0 ? Math.round((r.dnCorrect / r.dnTotal) * 100) : null
            return (
              <div key={r.playerId} className="flex flex-col gap-1.5 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    <span className="text-muted-foreground">{i + 1}. </span>
                    {r.name}
                    {isYou && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  <span className="font-semibold">{r.careerNet} career pts</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {r.seasons} season{r.seasons === 1 ? '' : 's'}
                  </span>
                  {r.championships > 0 && (
                    <span>
                      🏆 {r.championships} championship{r.championships === 1 ? '' : 's'}
                    </span>
                  )}
                  {r.weeksWon > 0 && (
                    <span>
                      {r.weeksWon} week{r.weeksWon === 1 ? '' : 's'} won
                    </span>
                  )}
                  {dnRate !== null && (
                    <span>
                      Bonus Team: {r.dnCorrect}/{r.dnTotal} ({dnRate}%)
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Win the Week is only tracked for 2024–2025 (it wasn&apos;t a real rule before then).
        Bonus Team success rate excludes Conference Title Week picks, which weren&apos;t
        tracked for outcome in the source data.
      </p>
    </div>
  )
}
