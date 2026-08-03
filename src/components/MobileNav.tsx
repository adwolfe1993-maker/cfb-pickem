'use client'

import { useState } from 'react'
import Link from 'next/link'
import LogoutButton from './LogoutButton'

type NavLink = {
  href: string
  label: string
}

export default function MobileNav({ links }: { links: NavLink[] }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Desktop / wide screens: unchanged horizontal row */}
      <div className="hidden items-center gap-4 text-sm font-medium sm:flex sm:flex-wrap">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-accent">
            {link.label}
          </Link>
        ))}
        <LogoutButton />
      </div>

      {/* Mobile: hamburger toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
        className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-primary-foreground/10 sm:hidden"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          {isOpen ? (
            <path d="M18 6 6 18M6 6l12 12" />
          ) : (
            <path d="M3 6h18M3 12h18M3 18h18" />
          )}
        </svg>
      </button>

      {/* Mobile: dropdown panel, only when open */}
      {isOpen && (
        <div className="absolute inset-x-0 top-full z-50 flex flex-col gap-1 border-t border-primary-foreground/20 bg-primary px-4 py-3 text-sm font-medium shadow-lg sm:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className="rounded-md px-2 py-2 hover:bg-primary-foreground/10"
            >
              {link.label}
            </Link>
          ))}
          <div className="px-2 py-1">
            <LogoutButton />
          </div>
        </div>
      )}
    </>
  )
}
