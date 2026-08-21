'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SeasonTabs({
  standings,
  winTheWeek,
  bonusTeamHistory,
  similarities,
}: {
  standings: React.ReactNode
  winTheWeek: React.ReactNode
  bonusTeamHistory: React.ReactNode
  similarities: React.ReactNode
}) {
  return (
    <Tabs defaultValue="standings">
      <TabsList>
        <TabsTrigger value="standings">Standings</TabsTrigger>
        <TabsTrigger value="win-the-week">Win the Week</TabsTrigger>
        <TabsTrigger value="bonus-team">Bonus Team</TabsTrigger>
        <TabsTrigger value="similarities">Similarities</TabsTrigger>
      </TabsList>
      <TabsContent value="standings">{standings}</TabsContent>
      <TabsContent value="win-the-week">{winTheWeek}</TabsContent>
      <TabsContent value="bonus-team">{bonusTeamHistory}</TabsContent>
      <TabsContent value="similarities">{similarities}</TabsContent>
    </Tabs>
  )
}
