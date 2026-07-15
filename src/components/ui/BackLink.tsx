'use client'

import Link from 'next/link'

// A pill-style back button, not a plain underlined text link — used on the
// finder-facing pages (Your Findings, find detail) so navigating between
// them feels like a deliberate, polished part of the app.
export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '7px',
        padding: '9px 16px', borderRadius: '999px',
        border: '1px solid var(--border-md)', background: 'var(--card)',
        color: 'var(--text)', textDecoration: 'none',
        fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600,
        letterSpacing: '0.02em', boxShadow: 'var(--shadow)',
        transition: 'border-color 0.18s ease, color 0.18s ease, transform 0.18s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--eth)'
        e.currentTarget.style.color = 'var(--eth)'
        e.currentTarget.style.transform = 'translateX(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-md)'
        e.currentTarget.style.color = 'var(--text)'
        e.currentTarget.style.transform = 'translateX(0)'
      }}
    >
      <span style={{ fontSize: '0.85rem' }}>←</span> {label}
    </Link>
  )
}
