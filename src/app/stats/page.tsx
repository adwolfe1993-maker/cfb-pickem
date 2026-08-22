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

