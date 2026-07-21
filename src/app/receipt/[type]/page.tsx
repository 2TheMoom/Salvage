import type { Metadata } from 'next'
import Link from 'next/link'
import SonarLogo from '@/components/ui/SonarLogo'

type SearchParams = Record<string, string | string[] | undefined>

// Reused by both the OG image (generateMetadata) and the on-page <img> —
// same query params the underlying /api/receipt/[type] route reads.
function buildImageUrl(type: string, sp: SearchParams): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === 'string') params.set(key, value)
  }
  return `/api/receipt/${type}?${params.toString()}`
}

export async function generateMetadata(
  { params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<SearchParams> }
): Promise<Metadata> {
  const { type } = await params
  const sp = await searchParams
  const imageUrl = buildImageUrl(type, sp)
  const title = type === 'find'
    ? 'A stranded-token find, registered on Salvage'
    : 'A recovery, settled on Salvage'

  return {
    title,
    // Ephemeral share content, not a page meant to be indexed/discovered.
    robots: { index: false, follow: false },
    openGraph: { title, images: [{ url: imageUrl, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, images: [imageUrl] },
  }
}

export default async function ReceiptPage(
  { params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<SearchParams> }
) {
  const { type } = await params
  const sp = await searchParams
  const imageUrl = buildImageUrl(type, sp)

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '28px',
      padding: '40px 20px', background: 'var(--bg)',
    }}>
      <Link href="/" style={{ textDecoration: 'none' }}>
        <SonarLogo size={28} variant="purple" showWordmark wordmarkSize="1.2rem" />
      </Link>

      {/* eslint-disable-next-line @next/next/no-img-element -- the receipt
          is a dynamically-generated image (next/og), not a static asset. */}
      <img
        src={imageUrl}
        alt="Salvage receipt"
        style={{
          maxWidth: '100%', width: '640px', borderRadius: '14px',
          boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-md)',
        }}
      />

      <Link
        href="/"
        style={{
          padding: '13px 30px', borderRadius: '8px', textDecoration: 'none',
          background: 'var(--eth)', color: '#fff',
          fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}
      >
        Check out Salvage →
      </Link>
    </div>
  )
}
