import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/ui/Providers'

export const metadata: Metadata = {
  title: 'Salvage — What the EVM left behind',
  description:
    'Find ERC-20 tokens trapped in contracts that cannot spend them. Scan, register your find, and earn a finder\'s fee when the project recovers.',
  keywords: ['EVM', 'stranded tokens', 'ERC-20', 'recovery', 'Ethereum', 'Base', 'DeFi'],
  openGraph: {
    title: 'Salvage — What the EVM left behind',
    description: 'Find stranded ERC-20 tokens across Ethereum and Base. Earn a finder\'s fee.',
    url: 'https://salvage-olive.vercel.app',
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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}