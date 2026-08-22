import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type PickRow = {
  team_picked: string | null
  was_correct: boolean | null
}

type TeamStat = {
  displayName: string
  count: number
  correct: number
}

// Historical entry preserved a mix of casing for the same team (e.g.
// "Ohio State" / "Ohio state" / "ohio state") -- group case-insensitively
// so counts aren't silently split across variants, but keep whichever
// actual casing appeared most often as the display name. A blind
// initcap() would mangle acronym schools (BYU, TCU, SMU, USC, UCLA)
// into "Byu", "Tcu", etc., so this preserves real casing instead.
function aggregateTeamPicks(rows: PickRow[]): TeamStat[] {
  const byNormalized = new Map<string, { casingCounts: Map<string, number>; count: number; correct: number }>()

  for (const r of rows) {
    if (!r.team_picked) continue
    const key = r.team_picked.toLowerCase()
    if (!byNormalized.has(key)) {
      byNormalized.set(key, { casingCounts: new Map(), count: 0, correct: 0 })
    }
    const entry = byNormalized.get(key)!
    entry.casingCounts.set(r.team_picked, (entry.casingCounts.get(r.team_picked) ?? 0) + 1)
    entry.count += 1
    if (r.was_correct) entry.correct += 1
  }

  const stats: TeamStat[] = []
  for (const entry of byNormalized.values()) {
    let bestCasing = ''
    let bestCount = -1
    for (const [casing, n] of entry.casingCounts) {
      if (n > bestCount) {
        bestCasing = casing
        bestCount = n
      }
    }
    stats.push({ displayName: bestCasing, count: entry.count, correct: entry.correct })
  }

  return stats.sort((a, b) => b.count - a.count)
}

async function fetchAllRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'historical_dn_picks' | 'historical_hst_picks'
): Promise<PickRow[]> {
  const rows: PickRow[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('team_picked, was_correct')
      .eq('is_conference_title', false)
      .range(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    rows.push(...(data as PickRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

function TeamLeaderboard({ stats }: { stats: TeamStat[] }) {
  const top = stats.slice(0, 15)
  return (
    <div className="flex flex-col divide-y divide-border">
      {top.map((t, i) => {
        const rate = t.count > 0 ? Math.round((t.correct / t.count) * 100) : 0
        return (
          <div key={t.displayName} className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span className="text-muted-foreground">
              {i + 1}. {t.displayName}
            </span>
            <span className="font-medium">
              {t.count} picks
              <span className="ml-1.5 text-xs text-muted-foreground">({rate}% correct)</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default async function PickTrendsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [dnRows, hstRows] = await Promise.all([
    fetchAllRows(supabase, 'historical_dn_picks'),
    fetchAllRows(supabase, 'historical_hst_picks'),
  ])

  const dnStats = aggregateTeamPicks(dnRows)
  const hstStats = aggregateTeamPicks(hstRows)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Pick Trends</h1>
        <p className="text-sm text-muted-foreground">
          The most popular Bonus Team and Highest Scoring Team picks across every season since
          2020, and how often they actually paid off.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Bonus Team Picks</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamLeaderboard stats={dnStats} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Highest Scoring Team Picks</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamLeaderboard stats={hstStats} />
        </CardContent>
      </Card>
    </div>
  )
}

