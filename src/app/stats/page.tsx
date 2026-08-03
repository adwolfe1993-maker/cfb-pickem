import Link from 'next/link'
import {
  Card,
  CardContent,
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
    title: 'D/N History',
    description: "Everyone's Double or Nothing selections this season.",
  },
  {
    href: '/similarities',
    title: 'Similarities',
    description: 'Pairwise pick agreement — your most and least similar picker.',
  },
]

export default function StatsHubPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <h1 className="text-2xl font-semibold">Stats</h1>

      <div className="flex flex-col gap-3">
        {STATS_PAGES.map((stat) => (
          <Link key={stat.href} href={stat.href} className="block w-full">
            <Card className="w-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-base font-medium">{stat.title}</CardTitle>
                <CardDescription>{stat.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
