'use client'

interface SonarLogoProps {
  size?: number
  variant?: 'white' | 'purple'
  showWordmark?: boolean
  wordmarkSize?: string
}

export default function SonarLogo({
  size = 28,
  variant = 'white',
  showWordmark = true,
  wordmarkSize = '1.2rem',
}: SonarLogoProps) {
  const color = variant === 'white' ? '#ffffff' : '#627EEA'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 52 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Salvage sonar mark"
      >
        {/* Outer arc — faintest */}
        <path
          d="M 8 44 A 26 26 0 0 1 44 8"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.18"
        />
        {/* Mid arc */}
        <path
          d="M 13 44 A 21 21 0 0 1 44 13"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.45"
        />
        {/* Inner arc — strongest */}
        <path
          d="M 19 44 A 15 15 0 0 1 44 19"
          stroke={color}
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
          opacity="0.82"
        />
        {/* Core dot — the discovery point */}
        <circle cx="44" cy="44" r="4.5" fill={color} />
        {/* Ping ring */}
        <circle
          cx="44"
          cy="44"
          r="8"
          stroke={color}
          strokeWidth="1.5"
          fill="none"
          opacity="0.25"
        />
      </svg>

      {showWordmark && (
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: wordmarkSize,
            fontWeight: 800,
            letterSpacing: '0.07em',
            textTransform: 'uppercase' as const,
            color: variant === 'white' ? '#ffffff' : '#1A1A1E',
            lineHeight: 1,
          }}
        >
          Salvage
        </span>
      )}
    </div>
  )
}