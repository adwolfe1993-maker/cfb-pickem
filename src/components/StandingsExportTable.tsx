'use client'

import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { Button } from '@/components/ui/button'

type SeasonStanding = {
  user_id: string
  display_name: string
  weeks_completed: number
  gross_score: number
  dropped_week_id: string | null
  dropped_week_name: string | null
  dropped_week_score: number | null
  net_score: number
  weeks_won: number
  tiebreaker_avg: number | null
}

type CompletedWeek = { id: string; name: string; week_number: number }

const EXPORT_COLORS = {
  background: '#F8F5F0',
  primary: '#6B1F2A',
  foreground: '#2B2B2E',
  muted: '#6B6B6E',
  border: '#E0DBD1',
}

const EXPORT_TARGET_ATTR = 'data-standings-export-target'

export default function StandingsExportTable({
  seasonName,
  standings,
  completedWeeks,
  weekRawScores,
  currentUserId,
  isCommissioner,
}: {
  seasonName: string
  standings: SeasonStanding[]
  completedWeeks: CompletedWeek[]
  weekRawScores: Record<string, Record<string, number>>
  currentUserId: string
  isCommissioner: boolean
}) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const handleExport = async () => {
    if (!tableRef.current) return
    setExporting(true)
    setExportError('')

    try {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: EXPORT_COLORS.background,
        scale: 2,
        // html2canvas clones the entire document and reads computed
        // styles on ancestors too, not just the captured region. This app's
        // Tailwind base layer applies oklch-derived colors globally via
        // `* { border-border; outline-ring/50 }`, which html2canvas's
        // internal color parser can't handle. Fix, arrived at after several
        // rounds of real stack-trace-driven debugging: neutralize
        // border/outline/box-shadow on every element in the clone
        // (including inside the target region, since none of the table's
        // own cells set those three explicitly), while only overriding
        // background/text color OUTSIDE the target — inside it, the
        // table's deliberate per-cell hex colors (maroon Net score vs.
        // muted stats) must be preserved exactly as authored.
        onclone: (clonedDoc) => {
          const target = clonedDoc.querySelector<HTMLElement>(`[${EXPORT_TARGET_ATTR}]`)

          clonedDoc.querySelectorAll<HTMLElement>('*').forEach((el) => {
            el.style.borderColor = EXPORT_COLORS.border
            el.style.outline = 'none'
            el.style.boxShadow = 'none'

            if (target && target.contains(el)) return
            el.style.backgroundColor = EXPORT_COLORS.background
            el.style.color = EXPORT_COLORS.foreground
          })
        },
      })

      const link = document.createElement('a')
      link.download = `${seasonName.replace(/\s+/g, '-')}-standings.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const sorted = standings.slice().sort((a, b) => {
    if (b.net_score !== a.net_score) return b.net_score - a.net_score
    if (b.gross_score !== a.gross_score) return b.gross_score - a.gross_score
    return a.display_name.localeCompare(b.display_name)
  })

  return (
    <div className="flex flex-col gap-3">
      {isCommissioner && sorted.length > 0 && (
        <div className="flex items-center gap-2 self-end">
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export PNG'}
          </Button>
        </div>
      )}
      {exportError && <p className="text-sm text-destructive">{exportError}</p>}

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No completed weeks yet — standings will appear once the commissioner marks a week
          complete.
        </p>
      ) : (
        <div
          ref={tableRef}
          {...{ [EXPORT_TARGET_ATTR]: true }}
          style={{ backgroundColor: EXPORT_COLORS.background, padding: '8px' }}
          className="overflow-x-auto"
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${EXPORT_COLORS.border}` }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '8px',
                    fontWeight: 500,
                    color: EXPORT_COLORS.foreground,
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    backgroundColor: EXPORT_COLORS.background,
                  }}
                >
                  Participant
                </th>
                <th style={{ textAlign: 'right', padding: '8px', fontWeight: 500, color: EXPORT_COLORS.foreground }}>
                  Net
                </th>
                <th style={{ textAlign: 'right', padding: '8px', fontWeight: 500, color: EXPORT_COLORS.foreground }}>
                  Gross
                </th>
                <th style={{ textAlign: 'right', padding: '8px', fontWeight: 500, color: EXPORT_COLORS.foreground }}>
                  Wins
                </th>
                <th style={{ textAlign: 'right', padding: '8px', fontWeight: 500, color: EXPORT_COLORS.foreground }}>
                  Tiebreaker Avg
                </th>
                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 500, minWidth: '140px', color: EXPORT_COLORS.foreground }}>
                  Dropped Week
                </th>
                {completedWeeks.map((w) => (
                  <th key={w.id} style={{ textAlign: 'right', padding: '8px', fontWeight: 500, color: EXPORT_COLORS.foreground }}>
                    {w.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={row.user_id} style={{ borderBottom: `1px solid ${EXPORT_COLORS.border}` }}>
                  <td
                    style={{
                      padding: '8px',
                      fontWeight: 500,
                      color: EXPORT_COLORS.foreground,
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      backgroundColor: EXPORT_COLORS.background,
                    }}
                  >
                    {i === 0 && '🏆 '}
                    {row.display_name}
                    {row.user_id === currentUserId && (
                      <span style={{ color: EXPORT_COLORS.muted }}> (you)</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px', fontWeight: 600, color: EXPORT_COLORS.primary }}>
                    {row.net_score}
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px', color: EXPORT_COLORS.muted }}>
                    {row.gross_score}
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px', color: EXPORT_COLORS.muted }}>
                    {row.weeks_won}
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px', color: EXPORT_COLORS.muted }}>
                    {row.tiebreaker_avg != null ? row.tiebreaker_avg.toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: '8px', color: EXPORT_COLORS.muted }}>
                    {row.dropped_week_name
                      ? `${row.dropped_week_name} (${row.dropped_week_score})`
                      : '—'}
                  </td>
                  {completedWeeks.map((w) => (
                    <td key={w.id} style={{ textAlign: 'right', padding: '8px', color: EXPORT_COLORS.foreground }}>
                      {weekRawScores[w.id]?.[row.user_id] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
