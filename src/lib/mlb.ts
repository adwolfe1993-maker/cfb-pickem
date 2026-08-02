const MLB_BASE_URL = 'https://statsapi.mlb.com/api/v1'

export type MlbGame = {
  gamePk: number
  gameDate: string
  officialDate: string
  status: {
    abstractGameState: 'Preview' | 'Live' | 'Final'
    detailedState: string
    codedGameState: string
  }
  teams: {
    away: { score: number | null; team: { id: number; name: string }; isWinner?: boolean }
    home: { score: number | null; team: { id: number; name: string }; isWinner?: boolean }
  }
  venue: { id: number; name: string } | null
  gameType: string
}

type MlbScheduleResponse = {
  dates: {
    date: string
    games: MlbGame[]
  }[]
}

export async function fetchMlbGames(params: {
  date: string
  gameType?: 'R' | 'P' | 'S' | 'E'
}): Promise<MlbGame[]> {
  const searchParams = new URLSearchParams({
    sportId: '1',
    date: params.date,
    gameType: params.gameType ?? 'R',
  })

  const res = await fetch(`${MLB_BASE_URL}/schedule?${searchParams.toString()}`, {
    // No API key/rate limit to protect here (unlike CFBD) — short cache
    // just avoids redundant calls while the commissioner is building a slate.
    next: { revalidate: 300 },
  })

  if (!res.ok) {
    throw new Error(`MLB Stats API error: ${res.status} ${res.statusText}`)
  }

  const data: MlbScheduleResponse = await res.json()
  return data.dates.flatMap((d) => d.games)
}
