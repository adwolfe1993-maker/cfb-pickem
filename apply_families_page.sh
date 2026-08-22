#!/bin/bash
set -e

mkdir -p "src/app/stats/families"
cat > "src/app/stats/families/page.tsx" << 'SCRIPT_EOF'
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
SCRIPT_EOF

mkdir -p "src/app/stats"
cat > "src/app/stats/page.tsx" << 'SCRIPT_EOF'
import Link from 'next/link'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const STATS_PAGES = [
  {
    href: '/season',
    title: 'Current Season',
    description: 'Standings, Win the Week, Bonus Team History, and Similarities.',
  },
  {
    href: '/history',
    title: 'League History',
    description: 'Final standings and Bonus Team picks from every season since 2019.',
  },
  {
    href: '/stats/pick-trends',
    title: 'Pick Trends',
    description: 'The most popular Bonus Team and Highest Scoring Team picks league-wide, and how often they paid off.',
  },
  {
    href: '/stats/streaks',
    title: 'Iron Man',
    description: 'Longest streaks of consecutive weeks with a submitted pick, across seasons.',
  },
  {
    href: '/stats/consistency',
    title: 'Consistency',
    description: 'Who performs closest to the field every week, and who swings hardest from boom to bust.',
  },
  {
    href: '/stats/season-swings',
    title: 'Breakout & Letdown Seasons',
    description: "The seasons where someone most exceeded, or most fell short of, their own career norm.",
  },
  {
    href: '/stats/rivalries',
    title: 'Head-to-Head Rivalries',
    description: 'Pick any two participants and see their week-by-week series, plus the most lopsided and most even rivalries in the league.',
  },
  {
    href: '/stats/wall-of-shame',
    title: 'Ohio State Wall of Shame',
    description: 'Every recorded pick against the family team, in chronological order.',
  },
  {
    href: '/stats/families',
    title: 'Family Bragging Rights',
    description: 'Combined percentile finish across every season, family by family.',
  },
]

export default function StatsHubPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 py-12">
      <h1 className="text-2xl font-semibold">Stats</h1>

      {STATS_PAGES.map((stat) => (
        // Card is the actual flex child (a plain div) — the clickable
        // Link lives inside it as an invisible full-cover overlay instead
        // of wrapping it, so an <a> tag never has to be a flex item.
        // Safari has long-standing bugs sizing anchors as flex children;
        // four rounds of className patches on a Link-wraps-Card structure
        // (confirmed via live DevTools computed-width inspection) never
        // resolved it, which is what this restructure is working around.
        <Card key={stat.href} className="relative w-full transition-colors hover:bg-accent">
          <Link href={stat.href} className="absolute inset-0" aria-label={stat.title} />
          <CardHeader>
            <CardTitle className="text-base font-medium">{stat.title}</CardTitle>
            <CardDescription>{stat.description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
SCRIPT_EOF

echo "Family Bragging Rights page written."
