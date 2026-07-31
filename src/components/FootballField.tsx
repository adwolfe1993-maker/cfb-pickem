import BuckLogo from './BuckLogo'

const YARD_LABELS = ['10', '20', '30', '40', '50', '40', '30', '20', '10']

// Mowed stripes mirror outward from the 50-yard line — the two segments
// touching midfield share a mow direction, matching how real fields are cut.
const STRIPE_PATTERN = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0]

export default function FootballField() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex flex-row overflow-hidden"
    >
      {/* Left end zone */}
      <div className="relative flex w-20 shrink-0 items-center justify-center bg-primary/85 sm:w-24">
        <span className="origin-center -rotate-90 whitespace-nowrap text-2xl font-extrabold uppercase tracking-widest text-accent sm:text-3xl">
          The Buck
        </span>
      </div>

      {/* Playing field: 10 mirrored 10-yard segments */}
      <div className="relative flex flex-1 flex-row">
        {STRIPE_PATTERN.map((stripe, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              backgroundColor:
                stripe === 0
                  ? 'oklch(0.5 0.14 152)'
                  : 'oklch(0.46 0.13 152)',
            }}
          />
        ))}

        {/* Yard lines + numbers, positioned at each 10-yard boundary.
            Top row is always upright, bottom row is always rotated 180° —
            each row is readable from its own sideline, consistently along
            the full field length (not split at midfield). */}
        {YARD_LABELS.map((label, i) => {
          const leftPercent = ((i + 1) / 10) * 100
          return (
            <div
              key={i}
              className="absolute inset-y-0 flex flex-col items-center"
              style={{ left: `${leftPercent}%`, transform: 'translateX(-50%)' }}
            >
              <div className="h-full w-[3px] bg-white/60" />
              <span className="absolute top-6 select-none text-3xl font-bold text-white/50 sm:top-12 sm:text-5xl">
                {label}
              </span>
              <span
                className="absolute bottom-6 select-none text-3xl font-bold text-white/50 sm:bottom-12 sm:text-5xl"
                style={{ transform: 'rotate(180deg)' }}
              >
                {label}
              </span>
            </div>
          )
        })}

        {/* Hash marks every 5 yards — two rows running the length of the
            field, inbound from each sideline. */}
        {Array.from({ length: 19 }).map((_, i) => {
          const leftPercent = ((i + 1) / 20) * 100
          if ((i + 1) % 2 === 0) return null // skip where a full yard line already exists
          return (
            <div key={`hash-${i}`} style={{ position: 'absolute', left: `${leftPercent}%` }}>
              <div
                className="absolute h-8 w-[3px] -translate-y-1/2 bg-white/70 sm:h-12"
                style={{ top: '30%' }}
              />
              <div
                className="absolute h-8 w-[3px] -translate-y-1/2 bg-white/70 sm:h-12"
                style={{ top: '70%' }}
              />
            </div>
          )
        })}

        {/* Logo marks at each 25-yard line, staggered top/bottom so they don't collide */}
        <div className="absolute top-[22%] left-[25%] h-20 w-20 -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-lg sm:h-32 sm:w-32">
          <BuckLogo className="h-full w-full" />
        </div>
        <div className="absolute top-[78%] left-[75%] h-20 w-20 -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-lg sm:h-32 sm:w-32">
          <BuckLogo className="h-full w-full" />
        </div>
      </div>

      {/* Right end zone */}
      <div className="relative flex w-20 shrink-0 items-center justify-center bg-primary/85 sm:w-24">
        <span className="origin-center rotate-90 whitespace-nowrap text-2xl font-extrabold uppercase tracking-widest text-accent sm:text-3xl">
          Stops Here
        </span>
      </div>

      {/* Vignette so the card stays readable */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/10 to-black/40" />
    </div>
  )
}
