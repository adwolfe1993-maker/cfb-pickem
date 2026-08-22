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
