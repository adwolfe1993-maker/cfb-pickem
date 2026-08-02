import sharp from 'sharp'
import { mkdirSync } from 'fs'

// Same mark as BuckLogo.tsx (Charter §16.3), but with real hex values baked
// in instead of Tailwind classes — this script runs standalone, outside the
// app's CSS context, so `fill-primary`/`text-accent`/`currentColor` would
// never resolve here.
const svg = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="48" fill="#6B1F2A" />
  <path
    d="M 18 30 L 32 68 L 46 42 L 60 68 L 85 22"
    fill="none"
    stroke="#C9A227"
    stroke-width="9"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
`.trim()

mkdirSync('public/icons', { recursive: true })

const sizes = [
  { size: 192, path: 'public/icons/icon-192.png' },
  { size: 512, path: 'public/icons/icon-512.png' },
  { size: 32, path: 'public/favicon-32.png' },
]

for (const { size, path } of sizes) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path)
  console.log(`Generated ${path} (${size}x${size})`)
}
