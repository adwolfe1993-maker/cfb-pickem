type BuckLogoProps = {
  className?: string
}

/**
 * "The Buck Stops Here" mark — Charter §16.3, checkmark-as-bracket, revised
 * to trace a W (down-up-down-up) with an elongated final stroke: reads as
 * "W" for Wolfe — the anchor family branch — while the long final rise still
 * reads as a checkmark, symbolizing a correct pick. Single-color linework by
 * design so it stays legible at small sizes (favicon, PWA icon, notification
 * badge).
 */
export default function BuckLogo({ className = '' }: BuckLogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="The Buck Stops Here logo"
    >
      <circle cx="50" cy="50" r="48" className="fill-primary" />
      <path
        d="M 18 30 L 32 68 L 46 42 L 60 68 L 85 22"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent"
      />
    </svg>
  )
}
