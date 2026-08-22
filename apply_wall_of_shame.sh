#!/bin/bash
set -e

mkdir -p "src/app/stats/wall-of-shame"
cat > "src/app/stats/wall-of-shame/page.tsx" << 'SCRIPT_EOF'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

type Row = {
  year: number
  week: number
  opponent: string
  osu_score: number
  opponent_score: number
  historical_players: { canonical_name: string } | null
}

type Game = {
  year: number
  week: number
  opponent: string
  osuScore: number
  opponentScore: number
  pickers: string[]
}

export default async function WallOfShamePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data } = await supabase
    .from('osu_wall_of_shame')
    .select('year, week, opponent, osu_score, opponent_score, historical_players(canonical_name)')
    .order('year', { ascending: true })
    .order('week', { ascending: true })

  const rows = (data ?? []) as unknown as Row[]

  // Combine every picker who took the same game into a single row, in the
  // same chronological order the source list was compiled in.
  const gamesByKey = new Map<string, Game>()
  const orderedKeys: string[] = []
  for (const r of rows) {
    const key = `${r.year}-${r.week}-${r.opponent}`
    if (!gamesByKey.has(key)) {
      gamesByKey.set(key, {
        year: r.year,
        week: r.week,
        opponent: r.opponent,
        osuScore: r.osu_score,
        opponentScore: r.opponent_score,
        pickers: [],
      })
      orderedKeys.push(key)
    }
    if (r.historical_players) gamesByKey.get(key)!.pickers.push(r.historical_players.canonical_name)
  }
  const games = orderedKeys.map((k) => gamesByKey.get(k)!)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Ohio State Wall of Shame</h1>
        <p className="text-sm text-muted-foreground">
          Every recorded pick against the family team, in order. A couple of these actually
          paid off, and they&apos;re still here.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y divide-border pt-6">
          {games.map((g) => {
            const osuLost = g.osuScore < g.opponentScore
            return (
              <div
                key={`${g.year}-${g.week}-${g.opponent}`}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {g.year} Wk {g.week} vs. {g.opponent}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {g.pickers.join(', ')}
                  </span>
                </div>
                <span className="text-right">
                  <span className="font-medium">
                    {g.osuScore}–{g.opponentScore}
                  </span>
                  {osuLost && (
                    <span className="block text-xs text-muted-foreground">
                      OSU lost this one
                    </span>
                  )}
                </span>
              </div>
            )
          })}
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

echo "Wall of Shame page written."
