import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextRequest } from 'next/server'

// Backed by Upstash Redis so the counter is shared across every serverless
// instance — an in-memory counter would reset on every cold start and give
// false confidence against a sustained scraper burning Alchemy/Etherscan
// quota. No-ops (allows every request) if Upstash isn't configured, so local
// dev without the env vars set doesn't break.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

// 8 scans per minute per IP — enough for genuine manual use (nobody scans
// more than a handful of contracts/wallets a minute by hand), tight enough
// that a scripted hammering of the endpoint gets throttled fast.
const limiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(8, '1 m'),
      analytics: true,
      prefix: 'salvage-ratelimit',
    })
  : null

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

export async function checkRateLimit(
  req: NextRequest,
  routeName: string
): Promise<{ limited: boolean; remaining?: number }> {
  if (!limiter) return { limited: false }

  const ip = clientIp(req)
  const { success, remaining } = await limiter.limit(`${routeName}:${ip}`)
  return { limited: !success, remaining }
}
