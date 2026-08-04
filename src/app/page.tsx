import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FootballField from '@/components/FootballField'
import EnableNotifications from '@/components/EnableNotifications'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, role, welcomed_at')
    .eq('id', user.id)
    .single()

  const isFirstVisit = !profile?.welcomed_at

  // Fire the one-time "seen it" flag now, using the profile data already
  // fetched above (from before this update) to decide what to render —
  // mark_welcomed is a narrow RPC that only ever touches the caller's own
  // welcomed_at, not a general update-your-own-row policy that could let
  // someone edit their own role.
  if (isFirstVisit) {
    await supabase.rpc('mark_welcomed')
    await supabase.rpc('claim_pending_managed_profile')
  }

  return (
    <div className="relative flex flex-1 items-center justify-center p-4">
      <FootballField />

      <Card className="relative z-10 w-full max-w-sm shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">
            {isFirstVisit ? `Welcome, ${profile?.display_name}!` : 'The Buck Stops Here'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <p>
              Logged in as <span className="font-medium">{user.email}</span>
            </p>
            <p>
              Display name <span className="font-medium">{profile?.display_name ?? '—'}</span>
            </p>
            <p>
              Role <span className="font-medium">{profile?.role ?? '—'}</span>
            </p>
          </div>
          <div className="border-t border-border pt-3">
            <EnableNotifications />
          </div>
          <Link href="/feedback" className="text-xs text-muted-foreground hover:underline">
            Something not working? Report it →
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
