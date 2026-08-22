'use client'

import { useEffect, useRef } from 'react'

const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
]

const SESSION_KEY = 'konami_triggered'
const CONFETTI_COLORS = ['#6B1F2A', '#C9A227']

type Piece = {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  size: number
  color: string
}

function runConfetti() {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '9999'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const pieces: Piece[] = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 3,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 10,
    size: 6 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  }))

  const start = performance.now()
  const duration = 3200

  function frame(now: number) {
    if (!ctx) return
    const elapsed = now - start
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const p of pieces) {
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.rotationSpeed

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    }

    if (elapsed < duration) {
      requestAnimationFrame(frame)
    } else {
      canvas.remove()
    }
  }

  requestAnimationFrame(frame)
}

function showMessage() {
  const el = document.createElement('div')
  el.textContent = 'No excuses, just Easter eggs.'
  el.style.position = 'fixed'
  el.style.top = '16%'
  el.style.left = '50%'
  el.style.transform = 'translateX(-50%)'
  el.style.zIndex = '10000'
  el.style.background = '#6B1F2A'
  el.style.color = '#F8F5F0'
  el.style.padding = '10px 20px'
  el.style.borderRadius = '9999px'
  el.style.fontSize = '14px'
  el.style.fontWeight = '600'
  el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)'
  el.style.opacity = '0'
  el.style.transition = 'opacity 400ms ease'
  el.style.pointerEvents = 'none'
  document.body.appendChild(el)

  requestAnimationFrame(() => {
    el.style.opacity = '1'
  })

  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 500)
  }, 2800)
}

export default function KonamiEasterEgg() {
  const progress = useRef(0)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (sessionStorage.getItem(SESSION_KEY)) return

      const expected = KONAMI_SEQUENCE[progress.current]
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (key === expected) {
        progress.current += 1
        if (progress.current === KONAMI_SEQUENCE.length) {
          sessionStorage.setItem(SESSION_KEY, '1')
          progress.current = 0
          runConfetti()
          showMessage()
        }
      } else {
        progress.current = key === KONAMI_SEQUENCE[0] ? 1 : 0
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
