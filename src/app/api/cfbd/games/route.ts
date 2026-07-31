import { NextRequest, NextResponse } from 'next/server'
import { fetchCfbdGames } from '@/lib/cfbd'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const year = searchParams.get('year')
  const week = searchParams.get('week')

  if (!year || !week) {
    return NextResponse.json(
      { error: 'year and week query params are required' },
      { status: 400 }
    )
  }

  try {
    const games = await fetchCfbdGames({ year: Number(year), week: Number(week) })
    return NextResponse.json(games)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
