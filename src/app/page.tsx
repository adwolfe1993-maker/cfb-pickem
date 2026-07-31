import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'
import FootballField from '@/components/FootballField'
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
    .select('display_name, role')
    .eq('id', user.id)
    .single()

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <FootballField />

      <Card className="relative z-10 w-full max-w-sm shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">The Buck Stops Here</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            <p>
              Logged in as <span className="font-medium">{user.email}</span>
            </p>
            <p>
              Display name{' '}
              <span className="font-medium">{profile?.display_name ?? '—'}</span>
            </p>
            <p>
              Role <span className="font-medium">{profile?.role ?? '—'}</span>
            </p>
          </div>

          <Link
            href="/picks"
            className="text-sm font-medium text-primary underline underline-offset-4"
          >
            This Week&apos;s Picks →
          </Link>

          {profile?.role === 'commissioner' && (
            <Link
              href="/commissioner/seasons"
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Manage Seasons →
            </Link>
          )}

          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  )
}
