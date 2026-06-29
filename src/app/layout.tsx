import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Salvage — What the EVM left behind',
  description:
    'Find ERC-20 tokens trapped in contracts that cannot spend them. Scan, register your find, and earn a finder\'s fee when the project recovers.',
  keywords: ['EVM', 'stranded tokens', 'ERC-20', 'recovery', 'Ethereum', 'Base', 'DeFi'],
  openGraph: {
    title: 'Salvage — What the EVM left behind',
    description: 'Find stranded ERC-20 tokens across Ethereum and Base. Earn a finder\'s fee.',
    url: 'https://salvagexyz.vercel.app',
    siteName: 'Salvage',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Salvage — What the EVM left behind',
    description: 'Find stranded ERC-20 tokens across Ethereum and Base.',
    creator: '@salvagexyz',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}