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
      <div className="w-20 shrink-0 bg-[oklch(0.32_0.09_258_/_85%)] sm:w-24" />

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

        {/* Yard lines + numbers, positioned at each 10-yard boundary */}
        {YARD_LABELS.map((label, i) => {
          const leftPercent = ((i + 1) / 10) * 100
          return (
            <div
              key={i}
              className="absolute inset-y-0 flex flex-col items-center"
              style={{ left: `${leftPercent}%`, transform: 'translateX(-50%)' }}
            >
              <div className="h-full w-[3px] bg-white/60" />
              <span
                className="absolute top-6 select-none text-3xl font-bold text-white/50 sm:top-12 sm:text-5xl"
                style={{
                  transform: i >= 5 ? 'rotate(180deg)' : undefined,
                }}
              >
                {label}
              </span>
              <span
                className="absolute bottom-6 select-none text-3xl font-bold text-white/50 sm:bottom-12 sm:text-5xl"
                style={{
                  transform: i >= 5 ? 'rotate(180deg)' : undefined,
                }}
              >
                {label}
              </span>
            </div>
          )
        })}

        {/* Hash marks every 5 yards (short ticks flanking the center) */}
        {Array.from({ length: 19 }).map((_, i) => {
          const leftPercent = ((i + 1) / 20) * 100
          if ((i + 1) % 2 === 0) return null // skip where a full yard line already exists
          return (
            <div key={`hash-${i}`} className="absolute inset-y-0" style={{ left: `${leftPercent}%` }}>
              <div className="my-auto h-10 w-[2px] bg-white/35 sm:h-16" />
            </div>
          )
        })}
      </div>

      {/* Right end zone */}
      <div className="w-20 shrink-0 bg-[oklch(0.32_0.09_258_/_85%)] sm:w-24" />

      {/* Vignette so the card stays readable */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/10 to-black/40" />
    </div>
  )
}
