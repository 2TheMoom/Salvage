import type { Metadata, Viewport } from 'next'
import './globals.css'
import Providers from '@/components/ui/Providers'

export const viewport: Viewport = {
  themeColor: '#0F0F11',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://usesalvage.xyz'),
  title: 'Salvage — Find and recover tokens stranded in smart contracts',
  description:
    'Scan any contract or your own wallet for stranded ERC-20 tokens, then recover them fully on-chain. Non-custodial settlement. Live on Ethereum and Base.',
  keywords: ['EVM', 'stranded tokens', 'ERC-20', 'recovery', 'Ethereum', 'Base', 'DeFi', 'smart contract recovery', 'non-custodial'],
  applicationName: 'Salvage',
  appleWebApp: {
    title: 'Salvage',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: 'Salvage — Recover tokens stranded in smart contracts',
    description:
      'Scan, triage, and recover stranded tokens on-chain. Non-custodial settlement with per-claim deposit addresses. Live on Ethereum and Base.',
    url: 'https://usesalvage.xyz',
    siteName: 'Salvage',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Salvage — Find and recover tokens stranded in smart contracts',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Salvage — Recover tokens stranded in smart contracts',
    description:
      'Scan, triage, and recover stranded tokens on-chain. Non-custodial. Live on Ethereum and Base.',
    creator: '@Salvage_xyz',
    site: '@Salvage_xyz',
    images: ['/og-image.png'],
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
  other: {
    // Base Dashboard domain-ownership verification for usesalvage.xyz
    'base:app_id': '6a49d54329e0b587da6d8eec',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}