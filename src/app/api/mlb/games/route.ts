import { NextRequest, NextResponse } from 'next/server'
import { fetchMlbGames } from '@/lib/mlb'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const date = searchParams.get('date')

  if (!date) {
    return NextResponse.json(
      { error: 'date query param is required (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  try {
    const games = await fetchMlbGames({ date })
    return NextResponse.json(games)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
