import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const TOOLS = [
  {
    href: '/commissioner/seasons',
    title: 'Manage Seasons',
    description: 'Create seasons and weeks, build slates, activate/deactivate, enter results.',
  },
  {
    href: '/commissioner/invite',
    title: 'Invite Participants',
    description: 'Add emails to the signup allowlist — this is the only way new accounts get created.',
  },
  {
    href: '/commissioner/managed-profiles',
    title: 'Managed Profiles',
    description: "For participants who share an inbox and can't get their own sign-in code.",
  },
]

export default function CommissionerHubPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-12">
      <h1 className="text-2xl font-semibold">Commissioner Tools</h1>

      <div className="flex flex-col gap-3">
        {TOOLS.map((tool) => (
          <Link key={tool.href} href={tool.href}>
            <Card className="w-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-base font-medium">{tool.title}</CardTitle>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
