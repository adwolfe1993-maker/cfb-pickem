#!/bin/bash
set -e

mkdir -p "src/components"
cat > "src/components/KonamiEasterEgg.tsx" << 'SCRIPT_EOF'
'use client'

import { useEffect, useRef } from 'react'

const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
]

const SESSION_KEY = 'konami_triggered'
const CONFETTI_COLORS = ['#6B1F2A', '#C9A227']

type Piece = {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  size: number
  color: string
}

function runConfetti() {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '9999'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const pieces: Piece[] = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 3,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 10,
    size: 6 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  }))

  const start = performance.now()
  const duration = 3200

  function frame(now: number) {
    if (!ctx) return
    const elapsed = now - start
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const p of pieces) {
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.rotationSpeed

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }

    if (elapsed < duration) {
      requestAnimationFrame(frame)
    } else {
      canvas.remove()
    }
  }

  requestAnimationFrame(frame)
}

function showMessage() {
  const el = document.createElement('div')
  el.textContent = 'No excuses, just Easter eggs.'
  el.style.position = 'fixed'
  el.style.top = '16%'
  el.style.left = '50%'
  el.style.transform = 'translateX(-50%)'
  el.style.zIndex = '10000'
  el.style.background = '#6B1F2A'
  el.style.color = '#F8F5F0'
  el.style.padding = '10px 20px'
  el.style.borderRadius = '9999px'
  el.style.fontSize = '14px'
  el.style.fontWeight = '600'
  el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)'
  el.style.opacity = '0'
  el.style.transition = 'opacity 400ms ease'
  el.style.pointerEvents = 'none'
  document.body.appendChild(el)

  requestAnimationFrame(() => {
    el.style.opacity = '1'
  })

  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 500)
  }, 2800)
}

export default function KonamiEasterEgg() {
  const progress = useRef(0)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (sessionStorage.getItem(SESSION_KEY)) return

      const expected = KONAMI_SEQUENCE[progress.current]
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (key === expected) {
        progress.current += 1
        if (progress.current === KONAMI_SEQUENCE.length) {
          sessionStorage.setItem(SESSION_KEY, '1')
          progress.current = 0
          runConfetti()
          showMessage()
        }
      } else {
        progress.current = key === KONAMI_SEQUENCE[0] ? 1 : 0
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
SCRIPT_EOF

mkdir -p "src/components"
cat > "src/components/ConsoleEasterEgg.tsx" << 'SCRIPT_EOF'
'use client'

import { useEffect } from 'react'

export default function ConsoleEasterEgg() {
  useEffect(() => {
    console.log(
      '%cTHE BUCK STOPS HERE',
      'color: #6B1F2A; font-size: 24px; font-weight: bold;'
    )
    console.log('%cNice try, snooping around.', 'color: #C9A227; font-size: 13px;')
  }, [])

  return null
}
SCRIPT_EOF

mkdir -p "src/app"
cat > "src/app/layout.tsx" << 'SCRIPT_EOF'
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/utils/supabase/server";
import { ThemeProvider } from "@/components/theme-provider";
import SiteNav from "@/components/SiteNav";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import KonamiEasterEgg from "@/components/KonamiEasterEgg";
import ConsoleEasterEgg from "@/components/ConsoleEasterEgg";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Buck Stops Here",
  description: "No excuses. Just picks.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon-32.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#6B1F2A",
};

type GameRow = {
  away_team: string | null
  home_team: string | null
}

async function isRivalryWeek(): Promise<boolean> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('games')
    .select('away_team, home_team, weeks!inner(status, seasons!inner(status))')
    .eq('weeks.status', 'active')
    .eq('weeks.seasons.status', 'active')

  const games = (data ?? []) as unknown as GameRow[]

  return games.some((g) => {
    const away = g.away_team?.toLowerCase().trim()
    const home = g.home_team?.toLowerCase().trim()
    return (
      (away === 'ohio state' && home === 'michigan') ||
      (away === 'michigan' && home === 'ohio state')
    )
  })
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const rivalryWeek = await isRivalryWeek()

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${rivalryWeek ? ' rivalry-week' : ''}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SiteNav />
          {children}
          <ServiceWorkerRegistration />
          <KonamiEasterEgg />
          <ConsoleEasterEgg />
        </ThemeProvider>
      </body>
    </html>
  );
}
SCRIPT_EOF

mkdir -p "src/app"
cat > "src/app/not-found.tsx" << 'SCRIPT_EOF'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import BuckLogo from '@/components/BuckLogo'

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-6 p-4 text-center">
      <BuckLogo className="h-16 w-16" />
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-2 pt-6">
          <h1 className="text-2xl font-semibold">Turnover on Downs</h1>
          <p className="text-sm text-muted-foreground">
            This page doesn&apos;t exist. Possession changes.
          </p>
          <Link
            href="/"
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Take the ball back →
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
SCRIPT_EOF

mkdir -p "src/app"
cat > "src/app/loading.tsx" << 'SCRIPT_EOF'
const LOADING_PHRASES = [
  'Asking Grandpa who he likes this week...',
  'Waiting for the TV timeout to end...',
  'Checking with the booth...',
]

export default function Loading() {
  // eslint-disable-next-line react-hooks/purity
  const phrase = LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-4 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">{phrase}</p>
    </div>
  )
}
SCRIPT_EOF

mkdir -p "src/app/stats/wall-of-shame"
cat > "src/app/stats/wall-of-shame/page.tsx" << 'SCRIPT_EOF'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

type Row = {
  year: number
  week: number
  opponent: string
  osu_score: number
  opponent_score: number
  historical_player_id: string
  historical_players: { canonical_name: string } | null
}

type Game = {
  year: number
  week: number
  opponent: string
  osuScore: number
  opponentScore: number
  pickers: string[]
}

export default async function WallOfShamePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data }, { data: allPlayersData }] = await Promise.all([
    supabase
      .from('osu_wall_of_shame')
      .select(
        'year, week, opponent, osu_score, opponent_score, historical_player_id, historical_players(canonical_name)'
      )
      .order('year', { ascending: true })
      .order('week', { ascending: true }),
    supabase.from('historical_players').select('id, canonical_name'),
  ])

  const rows = (data ?? []) as unknown as Row[]

  const shamedIds = new Set(rows.map((r) => r.historical_player_id))
  const allPlayers = (allPlayersData ?? []) as { id: string; canonical_name: string }[]
  const cleanRecord = allPlayers
    .filter((p) => !shamedIds.has(p.id))
    .map((p) => p.canonical_name)
    .sort((a, b) => a.localeCompare(b))

  const gamesByKey = new Map<string, Game>()
  const orderedKeys: string[] = []
  for (const r of rows) {
    const key = `${r.year}-${r.week}-${r.opponent}`
    if (!gamesByKey.has(key)) {
      gamesByKey.set(key, {
        year: r.year,
        week: r.week,
        opponent: r.opponent,
        osuScore: r.osu_score,
        opponentScore: r.opponent_score,
        pickers: [],
      })
      orderedKeys.push(key)
    }
    if (r.historical_players) gamesByKey.get(key)!.pickers.push(r.historical_players.canonical_name)
  }
  const games = orderedKeys.map((k) => gamesByKey.get(k)!)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <div>
        <Link href="/stats" className="text-sm text-muted-foreground hover:underline">
          ← Stats
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Ohio State Wall of Shame</h1>
        <p className="text-sm text-muted-foreground">
          Every recorded pick against the family team, in order. A couple of these actually
          paid off, and they&apos;re still here.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col divide-y divide-border pt-6">
          {games.map((g) => {
            const osuLost = g.osuScore < g.opponentScore
            return (
              <div
                key={`${g.year}-${g.week}-${g.opponent}`}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {g.year} Wk {g.week} vs. {g.opponent}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {g.pickers.join(', ')}
                  </span>
                </div>
                <span className="text-right">
                  <span className="font-medium">
                    {g.osuScore}–{g.opponentScore}
                  </span>
                  {osuLost && (
                    <span className="block text-xs text-muted-foreground">
                      OSU lost this one
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Never once: {cleanRecord.join(', ')}.
      </p>
    </div>
  )
}
SCRIPT_EOF

mkdir -p "src/app"
cat > "src/app/globals.css" << 'SCRIPT_EOF'
@import "tw-animate-css";
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-destructive: var(--destructive);
  --color-success-foreground: var(--success-foreground);
  --color-success: var(--success);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: oklch(0.971 0.0075 73);
  --foreground: oklch(0.29 0.006 288);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.29 0.006 288);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.29 0.006 288);
  --primary: oklch(0.36 0.11 18);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.93 0.01 73);
  --secondary-foreground: oklch(0.29 0.006 288);
  --muted: oklch(0.93 0.01 73);
  --muted-foreground: oklch(0.55 0.01 73);
  --accent: oklch(0.728 0.138 90);
  --accent-foreground: oklch(0.29 0.006 288);
  --destructive: oklch(0.58 0.22 27);
  --destructive-foreground: oklch(1 0 0);
  --success: oklch(0.54 0.14 152);
  --success-foreground: oklch(1 0 0);
  --border: oklch(0.88 0.01 73);
  --input: oklch(0.88 0.01 73);
  --ring: oklch(0.36 0.11 18);
  --chart-1: oklch(0.36 0.11 18);
  --chart-2: oklch(0.54 0.14 152);
  --chart-3: oklch(0.728 0.138 90);
  --chart-4: oklch(0.55 0.01 73);
  --chart-5: oklch(0.29 0.006 288);
  --radius: 0.5rem;
  --sidebar: oklch(0.98 0.005 73);
  --sidebar-foreground: oklch(0.29 0.006 288);
  --sidebar-primary: oklch(0.36 0.11 18);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.93 0.01 73);
  --sidebar-accent-foreground: oklch(0.29 0.006 288);
  --sidebar-border: oklch(0.88 0.01 73);
  --sidebar-ring: oklch(0.36 0.11 18);
}

.dark {
  --background: oklch(0.19 0.02 18);
  --foreground: oklch(0.95 0.01 73);
  --card: oklch(0.23 0.02 18);
  --card-foreground: oklch(0.95 0.01 73);
  --popover: oklch(0.23 0.02 18);
  --popover-foreground: oklch(0.95 0.01 73);
  --primary: oklch(0.62 0.14 18);
  --primary-foreground: oklch(0.19 0.02 18);
  --secondary: oklch(0.28 0.02 18);
  --secondary-foreground: oklch(0.95 0.01 73);
  --muted: oklch(0.28 0.02 18);
  --muted-foreground: oklch(0.68 0.01 73);
  --accent: oklch(0.78 0.13 90);
  --accent-foreground: oklch(0.19 0.02 18);
  --destructive: oklch(0.62 0.19 27);
  --destructive-foreground: oklch(1 0 0);
  --success: oklch(0.62 0.13 152);
  --success-foreground: oklch(0.19 0.02 18);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.62 0.14 18);
  --chart-1: oklch(0.62 0.14 18);
  --chart-2: oklch(0.62 0.13 152);
  --chart-3: oklch(0.78 0.13 90);
  --chart-4: oklch(0.5 0.02 73);
  --chart-5: oklch(0.35 0.02 18);
  --sidebar: oklch(0.23 0.02 18);
  --sidebar-foreground: oklch(0.95 0.01 73);
  --sidebar-primary: oklch(0.62 0.14 18);
  --sidebar-primary-foreground: oklch(0.19 0.02 18);
  --sidebar-accent: oklch(0.28 0.02 18);
  --sidebar-accent-foreground: oklch(0.95 0.01 73);
  --sidebar-border: oklch(1 0 0 / 12%);
  --sidebar-ring: oklch(0.62 0.14 18);
}

/* Ohio State vs. Michigan week: swap the brand maroon/gold for OSU's
   actual Scarlet and Gray. No maize, no blue. */
.rivalry-week {
  --primary: #bb0000;
  --primary-foreground: #ffffff;
  --accent: #666666;
  --accent-foreground: #ffffff;
  --ring: #bb0000;
  --sidebar-primary: #bb0000;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #666666;
  --sidebar-accent-foreground: #ffffff;
  --sidebar-ring: #bb0000;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
SCRIPT_EOF

echo "All easter eggs written."
