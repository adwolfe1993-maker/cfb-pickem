'use client'

import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { Button } from '@/components/ui/button'

type SeasonStanding = {
  user_id: string
  display_name: string
  team_name: string | null
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

  // Season standings tiebreak order: Net Score, then Gross Score, then
  // Tiebreaker Avg — the same three columns shown in the table, in that
  // order. Only falls back to alphabetical if literally all three match.
  // Null tiebreaker_avg (no revealed tiebreaker picks yet) sorts last.
  const sorted = standings.slice().sort((a, b) => {
    if (b.net_score !== a.net_score) return b.net_score - a.net_score
    if (b.gross_score !== a.gross_score) return b.gross_score - a.gross_score
    if (a.tiebreaker_avg == null && b.tiebreaker_avg != null) return 1
    if (a.tiebreaker_avg != null && b.tiebreaker_avg == null) return -1
    if (a.tiebreaker_avg != null && b.tiebreaker_avg != null && a.tiebreaker_avg !== b.tiebreaker_avg) {
      return b.tiebreaker_avg - a.tiebreaker_avg
    }
    return a.display_name.localeCompare(b.display_name)
  })

  // Tie-aware rank for medal assignment — standard competition ranking
  // (1224): two people tied for 1st both get gold, and the next distinct
  // score is rank 3 (bronze), not rank 2. A genuine tie means matching on
  // the FULL sort chain above (net, gross, tiebreaker avg), not just
  // net_score — otherwise two people net_score-tied but actually separated
  // by gross or tiebreaker would incorrectly share a medal.
  const ranked = sorted.reduce<Array<SeasonStanding & { rank: number }>>((acc, row) => {
    const prev = acc[acc.length - 1]
    const tiedWithPrev =
      prev &&
      prev.net_score === row.net_score &&
      prev.gross_score === row.gross_score &&
      prev.tiebreaker_avg === row.tiebreaker_avg
    const rank = tiedWithPrev ? prev.rank : acc.length + 1
    acc.push({ ...row, rank })
    return acc
  }, [])

  const MEDALS: Record<number, string> = { 1: '🏆 ', 2: '🥈 ', 3: '🥉 ' }

  return (
    <div className="flex flex-col gap-3">
      {isCommissioner && ranked.length > 0 && (
        <div className="flex items-center gap-2 self-end">
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export PNG'}
          </Button>
        </div>
      )}
      {exportError && <p className="text-sm text-destructive">{exportError}</p>}

      {ranked.length === 0 ? (
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
                {completedWeeks.map((w) => (
                  <th key={w.id} style={{ textAlign: 'right', padding: '8px', fontWeight: 500, color: EXPORT_COLORS.foreground }}>
                    {w.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((row) => (
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
                    {MEDALS[row.rank] ?? ''}
                    {row.team_name ? (
                      <>
                        {row.team_name}
                        <span style={{ color: EXPORT_COLORS.muted, fontWeight: 400 }}>
                          {' '}
                          ({row.display_name})
                        </span>
                      </>
                    ) : (
                      row.display_name
                    )}
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
                  {completedWeeks.map((w) => {
                    const isDropped = row.dropped_week_id === w.id
                    return (
                      <td
                        key={w.id}
                        style={{
                          textAlign: 'right',
                          padding: '8px',
                          color: isDropped ? EXPORT_COLORS.muted : EXPORT_COLORS.foreground,
                          textDecoration: isDropped ? 'line-through' : 'none',
                        }}
                        title={isDropped ? 'Dropped week — excluded from Net Score' : undefined}
                      >
                        {weekRawScores[w.id]?.[row.user_id] ?? '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ranked.some((r) => r.dropped_week_id) && (
        <p style={{ fontSize: '12px', color: EXPORT_COLORS.muted }}>
          <span style={{ textDecoration: 'line-through' }}>Struck-through</span> score = that
          participant&apos;s dropped week, excluded from Net Score.
        </p>
      )}
    </div>
  )
}
