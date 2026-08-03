import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import BuckLogo from './BuckLogo'
import MobileNav from './MobileNav'

export default async function SiteNav() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const links = [
    { href: '/', label: 'Home' },
    { href: '/team-name', label: 'Team Name' },
    { href: '/picks', label: 'My Picks' },
    { href: '/picks/status', label: "Who's Picked" },
    { href: '/picks/grid', label: 'Pick Grid' },
    { href: '/dn-history', label: 'D/N History' },
    { href: '/win-the-week', label: 'Win the Week' },
    { href: '/similarities', label: 'Similarities' },
    { href: '/standings', label: 'Standings' },
    ...(profile?.role === 'commissioner'
      ? [{ href: '/commissioner', label: 'Commissioner Tools' }]
      : []),
  ]

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-primary px-4 py-3 text-primary-foreground shadow-sm relative">
      <Link href="/" className="flex items-center gap-2">
        <div className="rounded-full bg-background p-1">
          <BuckLogo className="h-6 w-6" />
        </div>
        <span className="hidden text-sm font-semibold uppercase tracking-wide sm:inline">
          The Buck Stops Here
        </span>
      </Link>

      <MobileNav links={links} />
    </nav>
  )
}
