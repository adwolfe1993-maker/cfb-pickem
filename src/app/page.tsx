import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
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
    <div className="relative flex flex-1 items-center justify-center p-4">
      <FootballField />

      <Card className="relative z-10 w-full max-w-sm shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">The Buck Stops Here</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            Logged in as <span className="font-medium">{user.email}</span>
          </p>
          <p>
            Display name <span className="font-medium">{profile?.display_name ?? '—'}</span>
          </p>
          <p>
            Role <span className="font-medium">{profile?.role ?? '—'}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
