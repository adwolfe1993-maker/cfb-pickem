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
