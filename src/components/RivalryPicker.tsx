'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type PlayerOption = { id: string; name: string }
type RivalryRecord = { aWins: number; bWins: number; ties: number; games: number }

export default function RivalryPicker({
  players,
  records,
}: {
  players: PlayerOption[]
  records: Record<string, RivalryRecord>
}) {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name))
  const [playerAId, setPlayerAId] = useState(sorted[0]?.id ?? '')
  const [playerBId, setPlayerBId] = useState(sorted[1]?.id ?? '')

  const nameById = new Map(players.map((p) => [p.id, p.name]))

  let display: { aName: string; bName: string; aWins: number; bWins: number; ties: number; games: number } | null =
    null

  if (playerAId && playerBId && playerAId !== playerBId) {
    const key = playerAId < playerBId ? `${playerAId}:${playerBId}` : `${playerBId}:${playerAId}`
    const rec = records[key]
    const flip = playerAId > playerBId
    display = {
      aName: nameById.get(playerAId) ?? '',
      bName: nameById.get(playerBId) ?? '',
      aWins: rec ? (flip ? rec.bWins : rec.aWins) : 0,
      bWins: rec ? (flip ? rec.aWins : rec.bWins) : 0,
      ties: rec?.ties ?? 0,
      games: rec?.games ?? 0,
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Look Up a Rivalry</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <select
            value={playerAId}
            onChange={(e) => setPlayerAId(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">vs.</span>
          <select
            value={playerBId}
            onChange={(e) => setPlayerBId(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {playerAId === playerBId ? (
          <p className="text-sm text-muted-foreground">Pick two different people.</p>
        ) : display && display.games === 0 ? (
          <p className="text-sm text-muted-foreground">
            {display.aName} and {display.bName} have never both submitted a pick in the same
            week.
          </p>
        ) : display ? (
          <div className="flex flex-col items-center gap-1 py-2 text-center">
            <span className="text-2xl font-semibold">
              {display.aWins} – {display.bWins}
              {display.ties > 0 ? ` – ${display.ties}` : ''}
            </span>
            <span className="text-xs text-muted-foreground">
              {display.aName} vs. {display.bName} · {display.games} shared week
              {display.games === 1 ? '' : 's'}
              {display.ties > 0 ? ` (${display.ties} tied)` : ''}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

