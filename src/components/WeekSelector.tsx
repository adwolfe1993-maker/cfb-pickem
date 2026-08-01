'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

type WeekOption = {
  id: string
  name: string
  week_number: number
  status: string
}

export default function WeekSelector({
  seasonId,
  currentWeekId,
  viewSuffix = '',
}: {
  seasonId: string
  currentWeekId: string
  viewSuffix?: string
}) {
  const [weeks, setWeeks] = useState<WeekOption[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('weeks')
        .select('id, name, week_number, status')
        .eq('season_id', seasonId)
        .order('week_number', { ascending: true })
      setWeeks(data ?? [])
    }
    load()
  }, [seasonId])

  if (weeks.length <= 1) return null

  return (
    <select
      value={currentWeekId}
      onChange={(e) => router.push(`/picks/${e.target.value}${viewSuffix}`)}
      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
    >
      {weeks.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
          {w.status === 'active' ? ' (active)' : ''}
        </option>
      ))}
    </select>
  )
}
