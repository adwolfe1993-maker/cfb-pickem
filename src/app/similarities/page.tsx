import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import SimilaritiesMatrix from '@/components/SimilaritiesMatrix'

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

  // Below this many shared revealed games, a "100% agreement" is often
  // just 1-for-1 luck, not a real pattern — misleading as a headline stat
  // next to someone with 15 games at 93%. Prefer pairs/edges that clear
  // this bar; only fall back to the full set if nobody has yet (early
  // season, few games revealed so far).
  const MIN_GAMES_FOR_HEADLINE = 3

  const myEdges = edgesByUser[user.id] ?? []
  const myQualifyingEdges = myEdges.filter((e) => e.compared >= MIN_GAMES_FOR_HEADLINE)
  const myEdgePool = myQualifyingEdges.length > 0 ? myQualifyingEdges : myEdges
  const myMost = myEdgePool.length > 0
    ? myEdgePool.reduce((a, b) => (b.rate > a.rate ? b : a))
    : null
  const myLeast = myEdgePool.length > 0
    ? myEdgePool.reduce((a, b) => (b.rate < a.rate ? b : a))
    : null

  const qualifyingRows = rows.filter((r) => r.games_compared >= MIN_GAMES_FOR_HEADLINE)
  const rowPool = qualifyingRows.length > 0 ? qualifyingRows : rows
  const mostSimilarPair = rowPool.length > 0
    ? rowPool.reduce((a, b) => (b.agreement_rate > a.agreement_rate ? b : a))
    : null
  const leastSimilarPair = rowPool.length > 0
    ? rowPool.reduce((a, b) => (b.agreement_rate < a.agreement_rate ? b : a))
    : null

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Similarities</h1>
        <Link href="/stats" className="text-sm font-medium text-primary underline underline-offset-4">
          ← Stats
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        See how often you and everyone else pick the same winners, based on games that have
        already kicked off.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No games have kicked off yet this week — check back once picks start locking in.
        </p>
      ) : (
        <>
          {myMost && myLeast && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">You</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <p>
                  Most similar to <span className="font-medium">{myMost.otherName}</span>{' '}
                  ({myMost.rate}%)
                </p>
                <p>
                  Least similar to <span className="font-medium">{myLeast.otherName}</span>{' '}
                  ({myLeast.rate}%)
                </p>
              </CardContent>
            </Card>
          )}

          {mostSimilarPair && leastSimilarPair && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">League-Wide</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <p>
                  Most in sync:{' '}
                  <span className="font-medium">
                    {mostSimilarPair.user_a_name} &amp; {mostSimilarPair.user_b_name}
                  </span>{' '}
                  ({mostSimilarPair.agreement_rate}%)
                </p>
                <p>
                  Furthest apart:{' '}
                  <span className="font-medium">
                    {leastSimilarPair.user_a_name} &amp; {leastSimilarPair.user_b_name}
                  </span>{' '}
                  ({leastSimilarPair.agreement_rate}%)
                </p>
              </CardContent>
            </Card>
          )}

          <SimilaritiesMatrix
            participantIds={participantIds}
            nameById={nameById}
            edgesByUser={edgesByUser}
          />
        </>
      )}
    </div>
  )
}
