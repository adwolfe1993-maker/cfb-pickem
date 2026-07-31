const CFBD_BASE_URL = 'https://api.collegefootballdata.com'

export type CfbdGame = {
  id: number
  season: number
  week: number
  startDate: string
  completed: boolean
  neutralSite: boolean
  venue: string | null
  homeTeam: string
  homeClassification: string
  homeConference: string | null
  homePoints: number | null
  awayTeam: string
  awayClassification: string
  awayConference: string | null
  awayPoints: number | null
}

export async function fetchCfbdGames(params: {
  year: number
  week?: number
  seasonType?: 'regular' | 'postseason'
}): Promise<CfbdGame[]> {
  const searchParams = new URLSearchParams({
    year: String(params.year),
    seasonType: params.seasonType ?? 'regular',
  })
  if (params.week) {
    searchParams.set('week', String(params.week))
  }

  const res = await fetch(`${CFBD_BASE_URL}/games?${searchParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${process.env.CFBD_API_KEY}`,
    },
    // Cache game schedule data for an hour — schedules rarely change mid-day,
    // and this keeps us well within CFBD's free-tier rate limits.
    next: { revalidate: 3600 },
  })

  if (!res.ok) {
    throw new Error(`CFBD API error: ${res.status} ${res.statusText}`)
  }

  return res.json()
}
