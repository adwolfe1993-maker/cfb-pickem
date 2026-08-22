'use client'

import { useEffect } from 'react'

export default function ConsoleEasterEgg() {
  useEffect(() => {
    console.log(
      '%cTHE BUCK STOPS HERE',
      'color: #6B1F2A; font-size: 24px; font-weight: bold;'
    )
    console.log('%cNice try, snooping around.', 'color: #C9A227; font-size: 13px;')
  }, [])

  return null
}
