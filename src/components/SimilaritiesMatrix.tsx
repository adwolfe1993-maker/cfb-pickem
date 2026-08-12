'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Edge = { otherId: string; otherName: string; rate: number; compared: number }

// Brand maroon (see charter Appendix D, #6B1F2A) at low, scaling alpha —
// a single-hue intensity scale reads as a heatmap without needing a second
// color for "low," and stays legible under the app's dark foreground text
// even at max intensity (capped well under full opacity).
const HEATMAP_RGB = '107, 31, 42'
const MAX_ALPHA = 0.45

function heatmapStyle(rate: number): React.CSSProperties {
  const alpha = Math.max(0, Math.min(100, rate)) / 100 * MAX_ALPHA
  return { backgroundColor: `rgba(${HEATMAP_RGB}, ${alpha.toFixed(2)})` }
}

export default function SimilaritiesMatrix({
  participantIds,
  nameById,
  edgesByUser,
}: {
  participantIds: string[]
  nameById: Record<string, string>
  edgesByUser: Record<string, Edge[]>
}) {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Everyone vs. Everyone</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide full matrix' : 'View full matrix'}
        </Button>
      </CardHeader>
      {open && (
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
                      <td
                        key={colId}
                        className="border-b border-border p-2"
                        style={edge ? heatmapStyle(edge.rate) : undefined}
                      >
                        {edge ? `${edge.rate}%` : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      )}
    </Card>
  )
}
