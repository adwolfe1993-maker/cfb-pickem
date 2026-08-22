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
