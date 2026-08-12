import Link from 'next/link'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const STATS_PAGES = [
  {
    href: '/standings',
    title: 'Standings',
    description: 'Season leaderboard — net score, gross score, weeks won, drop week.',
  },
  {
    href: '/win-the-week',
    title: 'Win the Week',
    description: 'Which participant won each week.',
  },
  {
    href: '/dn-history',
    title: 'Bonus Team History',
    description: "Everyone's Bonus Team selections this season.",
  },
  {
    href: '/similarities',
    title: 'Similarities',
    description: 'How often you and everyone else pick the same winners.',
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
