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
    { href: '/profile', label: 'Profile' },
    { href: '/picks', label: 'My Picks' },
    { href: '/stats', label: 'Stats' },
    { href: '/history', label: 'League History' },
    { href: '/playlists', label: 'Playlists' },
    ...(profile?.role === 'commissioner'
      ? [{ href: '/commissioner', label: 'Commissioner Tools' }]
      : []),
    { href: '/feedback', label: 'Report a Bug' },
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
