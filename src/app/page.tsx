import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FootballField from '@/components/FootballField'
import EnableNotifications from '@/components/EnableNotifications'
import { getCurrentSeason, needsWelcome } from '@/utils/currentSeason'
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

  const season = await getCurrentSeason(supabase)
  const showWelcome = await needsWelcome(supabase, user.id, season, profile?.welcomed_at ?? null)

  if (showWelcome) {
    // Claiming a pending managed-profile link (e.g. a spouse's account the
    // commissioner pre-created) is safe to run every time before welcomed_at
    // is set — it's a no-op once already claimed. mark_welcomed itself now

    // happens at the END of the /welcome flow instead of here, so someone
    // who bails out mid-setup still sees the guide next time instead of
    // landing on a bare "Welcome!" card with nothing to do.
    await supabase.rpc('claim_pending_managed_profile')
    redirect('/welcome')
  }

  return (
    <div className="relative flex flex-1 items-center justify-center p-4">
      <FootballField />

      <Card className="relative z-10 w-full max-w-sm shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">The Buck Stops Here</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <EnableNotifications />
          <div className="flex flex-col gap-1 border-t border-border pt-3">
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
          <Link href="/feedback" className="text-xs text-muted-foreground hover:underline">
            Something not working? Report it →
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
