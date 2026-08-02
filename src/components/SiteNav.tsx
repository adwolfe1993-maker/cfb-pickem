import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import BuckLogo from './BuckLogo'
import LogoutButton from './LogoutButton'

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

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-primary px-4 py-3 text-primary-foreground shadow-sm">
      <Link href="/" className="flex items-center gap-2">
        <div className="rounded-full bg-background p-1">
          <BuckLogo className="h-6 w-6" />
        </div>
        <span className="hidden text-sm font-semibold uppercase tracking-wide sm:inline">
          The Buck Stops Here
        </span>
      </Link>

      <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
        <Link href="/" className="hover:text-accent">
          Home
        </Link>
        <Link href="/picks" className="hover:text-accent">
          My Picks
        </Link>
        <Link href="/picks/status" className="hover:text-accent">
          Who&apos;s Picked
        </Link>
        <Link href="/picks/grid" className="hover:text-accent">
          Pick Grid
        </Link>
        <Link href="/dn-history" className="hover:text-accent">
          D/N History
        </Link>
        <Link href="/standings" className="hover:text-accent">
          Standings
        </Link>
        {profile?.role === 'commissioner' && (
          <Link href="/commissioner/seasons" className="hover:text-accent">
            Manage Seasons
          </Link>
        )}
        <LogoutButton />
      </div>
    </nav>
  )
}
