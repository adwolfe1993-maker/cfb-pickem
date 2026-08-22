import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardContent,
} from '@/components/ui/card'

type SeasonRow = { year: number; weeks_played: number }
type WeeklyRow = { year: number; historical_player_id: string; week_number: number; score: number }
type PlayerRow = { id: string; canonical_name: string }

type StreakResult = {
  playerId: string
  name: string
  length: number
  startYear: number
  startWeek: number
  endYear: number
  endWeek: number
}

async function fetchAllWeeklyScores(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<WeeklyRow[]> {
  const rows: WeeklyRow[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('historical_weekly_scores')
      .select('year, historical_player_id, week_number, score')
      .range(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    rows.push(
      ...data.map((d) => ({
        year: d.year,
        historical_player_id: d.historical_player_id,
        week_number: d.week_number,
        score: Number(d.score),
      }))
    )
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

// Longest run of consecutive chronological week-slots (spanning seasons)
// where a player had a nonzero score -- a missed pick scores zero by
// league rule, so "never got a zero" is the closest real signal we have
// for "never missed a week." A player with no row at all for a slot (a
// season they weren't in the league yet, or left) also breaks the streak,
// same as a genuine miss.
function computeLongestStreaks(
  seasons: SeasonRow[],
  players: PlayerRow[],
  weeklyScores: WeeklyRow[]
): StreakResult[] {
  const slots: { year: number; week: number }[] = []
  for (const s of seasons) {
    for (let w = 1; w <= s.weeks_played; w++) {
      slots.push({ year: s.year, week: w })
    }
  }

  const scoreByKey = new Map<string, number>()
  for (const w of weeklyScores) {
    scoreByKey.set(`${w.historical_player_id}:${w.year}:${w.week_number}`, w.score)
  }

  const results: StreakResult[] = []

  for (const p of players) {
    let bestLen = 0
    let bestStart = -1
    let bestEnd = -1
    let curLen = 0
    let curStart = -1

    for (let i = 0; i < slots.length; i++) {
      const { year, week } = slots[i]
      const score = scoreByKey.get(`${p.id}:${year}:${week}`)
      const submitted = score !== undefined && score !== 0

      if (submitted) {
        if (curLen === 0) curStart = i
        curLen++
        if (curLen > bestLen) {
          bestLen = curLen
          bestStart = curStart
          bestEnd = i
        }
      } else {
        curLen = 0
      }
    }

    if (bestLen > 0) {
      results.push({
        playerId: p.id,
        name: p.canonical_name,
        length: bestLen,
        startYear: slots[bestStart].year,
        startWeek: slots[bestStart].week,
        endYear: slots[bestEnd].year,
        endWeek: slots[bestEnd].week,
      })
    }
  }

  return results.sort((a, b) => b.length - a.length)
}

export default async function IronManPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: seasonsData }, { data: playersData }, weeklyScores] = await Promise.all([
    supabase.from('historical_seasons').select('year, weeks_played').order('year', { ascending: true }),
    supabase.from('historical_players').select('id, canonical_name'),
    fetchAllWeeklyScores(supabase),
  ])

  const seasons = (seasonsData ?? []) as SeasonRow[]
  const players = (playersData ?? []) as PlayerRow[]

  const streaks = computeLongestStreaks(seasons, players, weeklyScores).slice(0, 15)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Iron Man</h1>
        <p className="text-sm text-muted-foreground">
          Longest streak of consecutive weeks with a submitted pick, spanning seasons since
          2019. Conference Title Week isn&apos;t included, since it&apos;s scored differently.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y divide-border pt-6">
          {streaks.map((s, i) => (
            <div key={s.playerId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="text-muted-foreground">
                {i + 1}. {s.name}
              </span>
              <span className="text-right font-medium">
                {s.length} weeks
                <span className="ml-1.5 block text-xs font-normal text-muted-foreground sm:inline sm:ml-1.5">
                  ({s.startYear} Wk {s.startWeek} – {s.endYear} Wk {s.endWeek})
                </span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

