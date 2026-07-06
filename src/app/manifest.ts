import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Salvage — Find and recover tokens stranded in smart contracts',
    short_name: 'Salvage',
    description:
      'Scan any contract or your own wallet for stranded ERC-20 tokens, then recover them fully on-chain.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0F0F11',
    theme_color: '#0F0F11',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
