import Link from 'next/link'
import {
  Card,
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
  {
    href: '/commissioner/feedback',
    title: 'Feedback',
    description: 'See what participants have reported and mark issues resolved.',
  },
]

export default function CommissionerHubPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 py-12">
      <h1 className="text-2xl font-semibold">Commissioner Tools</h1>

      {TOOLS.map((tool) => (
        <Card key={tool.href} className="relative w-full transition-colors hover:bg-accent">
          <Link href={tool.href} className="absolute inset-0" aria-label={tool.title} />
          <CardHeader>
            <CardTitle className="text-base font-medium">{tool.title}</CardTitle>
            <CardDescription>{tool.description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
