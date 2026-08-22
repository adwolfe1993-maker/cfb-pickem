#!/bin/bash
set -e

mkdir -p "src/app"
cat > "src/app/loading.tsx" << 'SCRIPT_EOF'
const LOADING_PHRASES = [
  'Asking Grandpa who he likes this week...',
  'Waiting for the TV timeout to end...',
  'Checking with the booth...',
  'Reviewing the film...',
  'Consulting the Vegas line...',
  'Icing the kicker...',
  'Calling a timeout to think this through...',
  'Waiting for the chains to reset...',
  'Counting down to kickoff...',
  'Changing the channel when Dave Portnoy comes on...',
  'Not so fast, my friend...',
  'Buying a ticket to scout the other sideline...',
  'Reminding everyone this means more, probably...',
  'Hitting the Heisman pose a little early...',
  'Grumbling about the transfer portal again...',
  'Grinding out three yards and a cloud of dust...',
  'The dumbest people in life become football coaches...',
  'Asking Andrew to change my picks- again...',
  "Trying to remember which conference everyone's in now...",
  'Checking on my NIL deal...',
  "Looking past this week to next week's trap game...",
  "Second-guessing the committee's rankings...",
  'Waiting out a lightning delay...',
  "Waiting on Oregon's next uniform reveal...",
]

export default function Loading() {
  // Server Component, rendered fresh per navigation rather than
  // re-rendered client-side, so a random pick here doesn't have the
  // re-render instability the purity rule is meant to catch.
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

echo "Loading phrases expanded to 24."
