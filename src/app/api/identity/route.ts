import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { resolveIdentity } from '@/lib/identity'
import { isValidAddress } from '@/lib/utils'
import { checkRateLimit } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Same no-op-if-unconfigured guard as ratelimit.ts — local dev without
// Upstash env vars set just skips caching rather than breaking.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

// 24h: long enough that a normal scan session never re-hits ENS/Neynar for
// the same address twice, short enough that a changed Farcaster handle or
// newly-set Basename doesn't stay stale for weeks — a wrong cached contact
// name is worse than showing none at all.
const CACHE_TTL_SECONDS = 60 * 60 * 24
const CACHE_PREFIX = 'salvage-identity:'

export async function GET(req: NextRequest) {
  try {
    const { limited } = await checkRateLimit(req, 'identity')
    if (limited) {
      return NextResponse.json(
        { success: false, error: 'Too many requests — please wait a moment.' },
        { status: 429 }
      )
    }

    const address = req.nextUrl.searchParams.get('address')
    if (!address || !isValidAddress(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address' },
        { status: 400 }
      )
    }

    const cacheKey = `${CACHE_PREFIX}${address.toLowerCase()}`

    if (redis) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return NextResponse.json({ success: true, identity: cached })
      }
    }

    const identity = await resolveIdentity(address)

    if (redis) {
      await redis.set(cacheKey, identity, { ex: CACHE_TTL_SECONDS })
    }

    return NextResponse.json({ success: true, identity })
  } catch (err) {
    console.error('[/api/identity] error:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to resolve identity' },
      { status: 500 }
    )
  }
}
