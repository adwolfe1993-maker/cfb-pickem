import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
} from '@/components/ui/card'

// Hand-maintained family groupings, not stored in the DB -- small and
// likely to change again as people marry in or start dating a
// participant, so a plain array here is easier to update than a table.
// Several people belong to two groups on purpose (e.g. someone who
// married in still counts for their family of origin too): each of
// those counts fully toward both groups' stats, not split between them.
const FAMILY_GROUPS: { name: string; members: string[] }[] = [
  { name: 'OG Wolfes', members: ['Grandpa', 'Grandma', 'David', 'Kristin', 'Doug & Jess'] },
  { name: 'OG Knapiks', members: ['Lori', 'Neenie'] },
  {
    name: 'Poland Wolfes',
    members: ['David', 'Lori', 'Andrew', 'Jake', 'Hannah', 'Sarah', 'Rachel', 'Emma', 'Jason', 'Ethan'],
  },
  { name: 'Searches', members: ['Boyd', 'Kristin', 'Abby', 'Maddie', 'Ellie', 'Graham'] },
  { name: 'Carolina Wolfes', members: ['Doug & Jess', 'Anna', 'Nate', 'Leah', 'Adah'] },
  { name: 'Thornberrys', members: ['Dean', 'Neenie', 'Katie', 'Ally', 'Jack', 'Ben', 'Dylan', 'Hope'] },
  { name: 'Significant Others', members: ['Jason', 'Graham', 'Dylan', 'Hope', 'Ethan'] },
]

type StandingRow = {
  year: number
  rank: number
  historical_players: { canonical_name: string } | null
}

type TeamStat = {
  name: string
  avgPercentile: number
  seasonEntries: number
  championships: number
  weeksWon: number
}

export default async function FamiliesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: standingsData }, { data: wtwData }] = await Promise.all([
    supabase.from('historical_standings').select('year, rank, historical_players(canonical_name)'),
    supabase.from('historical_win_the_week').select('historical_players(canonical_name)'),
  ])

  const standings = (standingsData ?? []) as unknown as StandingRow[]
  const weeksWonRows = (wtwData ?? []) as unknown as { historical_players: { canonical_name: string } | null }[]

  // Percentile finish, same formula used on Career Stats and Breakout &
  // Letdown Seasons: 100th = won the season, 0th = last place, scaled to
  // that season's participant count. Keeps raw-point era differences
  // (Core Four vs. not) from skewing which family looks best.
  const participantsByYear = new Map<number, number>()
  for (const s of standings) {
    participantsByYear.set(s.year, (participantsByYear.get(s.year) ?? 0) + 1)
  }

  type PlayerSeason = { name: string; percentile: number; isChampionship: boolean }
  const playerSeasons: PlayerSeason[] = []
  for (const s of standings) {
    const p = s.historical_players
    if (!p) continue
    const n = participantsByYear.get(s.year) ?? 1
    const percentile = n > 1 ? 1 - (s.rank - 1) / (n - 1) : 1
    playerSeasons.push({ name: p.canonical_name, percentile, isChampionship: s.rank === 1 })
  }

  const weeksWonByName = new Map<string, number>()
  for (const w of weeksWonRows) {
    const name = w.historical_players?.canonical_name
    if (!name) continue
    weeksWonByName.set(name, (weeksWonByName.get(name) ?? 0) + 1)
  }

  const teamStats: TeamStat[] = FAMILY_GROUPS.map((group) => {
    const memberSet = new Set(group.members)
    const entries = playerSeasons.filter((ps) => memberSet.has(ps.name))
    const avgPercentile =
      entries.length > 0 ? entries.reduce((a, e) => a + e.percentile, 0) / entries.length : 0
    const championships = entries.filter((e) => e.isChampionship).length
    const weeksWon = group.members.reduce((a, name) => a + (weeksWonByName.get(name) ?? 0), 0)

    return {
      name: group.name,
      avgPercentile,
      seasonEntries: entries.length,
      championships,
      weeksWon,
    }
  }).sort((a, b) => b.avgPercentile - a.avgPercentile)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Family Bragging Rights</h1>
        <p className="text-sm text-muted-foreground">
          Every family&apos;s combined percentile finish across every season anyone in that
          group has played. Some people count for two groups on purpose, like someone who
          married in or is dating a participant.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y divide-border pt-6">
          {teamStats.map((t, i) => (
            <div key={t.name} className="flex flex-col gap-1 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  <span className="text-muted-foreground">{i + 1}. </span>
                  {t.name}
                </span>
                <span className="font-semibold">{Math.round(t.avgPercentile * 100)}th percentile</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{t.seasonEntries} combined seasons played</span>
                {t.championships > 0 && (
                  <span>
                    🏆 {t.championships} championship{t.championships === 1 ? '' : 's'}
                  </span>
                )}
                {t.weeksWon > 0 && (
                  <span>
                    {t.weeksWon} week{t.weeksWon === 1 ? '' : 's'} won
                  </span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
