import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default async function PickStatusPage({
  params,
}: {
  params: Promise<{ weekId: string }>
}) {
  const { weekId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: week } = await supabase
    .from('weeks')
    .select('id, name, week_type, season_id')
    .eq('id', weekId)
    .maybeSingle()

  if (!week) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 p-4 py-12">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold">Week Not Found</h1>
      </div>
    )
  }

  const { data: season } = await supabase
    .from('seasons')
    .select('name')
    .eq('id', week.season_id)
    .single()

  const { data: statusData } = await supabase.rpc('get_week_pick_status', {
    p_week_id: weekId,
  })

  const status = (statusData ?? [])
    .slice()
    .sort((a: { display_name: string }, b: { display_name: string }) =>
      a.display_name.localeCompare(b.display_name)
    )

  const completeCount = status.filter((s: { is_complete: boolean }) => s.is_complete).length

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link
          href={`/picks/${weekId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← My Picks
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{season?.name}</h1>
        <p className="text-muted-foreground">
          {week.name}
          {week.week_type === 'conference_title' && ' — Conference Title Week'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Who&apos;s Picked</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Selections themselves stay hidden until each game kicks off — this only shows
            who&apos;s finished. {completeCount} of {status.length} complete.
          </p>
          <div className="flex flex-wrap gap-2">
            {status.map(
              (s: { user_id: string; display_name: string; is_complete: boolean }) => (
                <span
                  key={s.user_id}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    s.is_complete
                      ? 'border-primary bg-primary/10 font-semibold text-primary'
                      : 'border-border text-muted-foreground opacity-50'
                  }`}
                >
                  {s.display_name}
                  {s.user_id === user.id && (
                    <span className={s.is_complete ? 'text-primary' : 'text-muted-foreground'}>
                      {' '}
                      (you)
                    </span>
                  )}
                </span>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
