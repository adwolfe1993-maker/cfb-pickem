import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type MatrixRow = {
  user_a_id: string
  user_a_name: string
  user_b_id: string
  user_b_name: string
  games_compared: number
  games_agreed: number
  agreement_rate: number
}

export default async function SimilaritiesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'active')
    .limit(1)

  const season = seasons?.[0]

  if (!season) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 p-4 py-12">
        <h1 className="text-2xl font-semibold">No Active Season</h1>
        <p className="text-sm text-muted-foreground">
          Check back once the commissioner starts a season.
        </p>
      </div>
    )
  }

  const { data: matrixData } = await supabase.rpc('get_similarities_matrix', {
    p_season_id: season.id,
  })
  const rows = (matrixData ?? []) as MatrixRow[]

  // Mirror each pair into both directions so per-participant "most/least
  // similar" can be computed without special-casing which side of the
  // original a<b comparison a person happened to land on.
  type Edge = { otherId: string; otherName: string; rate: number; compared: number }
  const edgesByUser: Record<string, Edge[]> = {}
  const nameById: Record<string, string> = {}

  for (const r of rows) {
    nameById[r.user_a_id] = r.user_a_name
    nameById[r.user_b_id] = r.user_b_name

    if (!edgesByUser[r.user_a_id]) edgesByUser[r.user_a_id] = []
    if (!edgesByUser[r.user_b_id]) edgesByUser[r.user_b_id] = []

    edgesByUser[r.user_a_id].push({
      otherId: r.user_b_id,
      otherName: r.user_b_name,
      rate: r.agreement_rate,
      compared: r.games_compared,
    })
    edgesByUser[r.user_b_id].push({
      otherId: r.user_a_id,
      otherName: r.user_a_name,
      rate: r.agreement_rate,
      compared: r.games_compared,
    })
  }

  const participantIds = Object.keys(edgesByUser).sort((a, b) =>
    nameById[a].localeCompare(nameById[b])
  )

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Similarities Matrix</h1>
        <Link href="/" className="text-sm font-medium text-primary underline underline-offset-4">
          ← Home
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        See how often each participant picks the same team as everyone else, based on games
        that have already kicked off.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No games have kicked off yet this week — check back once picks start locking in.
        </p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Most / Least Similar</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {participantIds.map((uid) => {
                  const edges = edgesByUser[uid]
                  const most = edges.reduce((a, b) => (b.rate > a.rate ? b : a))
                  const least = edges.reduce((a, b) => (b.rate < a.rate ? b : a))
                  return (
                    <li key={uid} className="text-sm">
                      <span className="font-medium">{nameById[uid]}</span> — most similar to{' '}
                      <span className="font-medium">{most.otherName}</span> ({most.rate}%),
                      least similar to <span className="font-medium">{least.otherName}</span>{' '}
                      ({least.rate}%)
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Full Matrix</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-border p-2 text-left"></th>
                    {participantIds.map((uid) => (
                      <th key={uid} className="border-b border-border p-2 text-left font-medium">
                        {nameById[uid]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {participantIds.map((rowId) => (
                    <tr key={rowId}>
                      <td className="border-b border-border p-2 font-medium">{nameById[rowId]}</td>
                      {participantIds.map((colId) => {
                        if (rowId === colId) {
                          return (
                            <td key={colId} className="border-b border-border p-2 text-muted-foreground">
                              —
                            </td>
                          )
                        }
                        const edge = edgesByUser[rowId].find((e) => e.otherId === colId)
                        return (
                          <td key={colId} className="border-b border-border p-2">
                            {edge ? `${edge.rate}%` : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
