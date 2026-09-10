import { network } from 'hardhat'

// Checks whether Alchemy's enhanced APIs (which src/lib/sweeper.ts depends
// on for stranded-token discovery, separate from plain RPC) actually cover
// Arc Testnet. Never prints the API key itself — only a redacted form when
// logging where it was found, for diagnostic purposes.

function redact(url: string): string {
  return url.replace(/\/v2\/[^/]+$/, '/v2/<redacted>')
}

function findUrl(obj: unknown, depth = 0): string | undefined {
  if (depth > 4 || obj === null || typeof obj !== 'object') return undefined
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'string' && /^https?:\/\/.+\/v2\/.+/.test(value)) return value
    if (key === 'url' && typeof value === 'string' && value.startsWith('http')) return value
    if (typeof value === 'object') {
      const found = findUrl(value, depth + 1)
      if (found) return found
    }
  }
  return undefined
}

async function main() {
  const connection = await network.connect()
  const { viem } = connection
  const publicClient = await viem.getPublicClient()

  // 1. Enhanced Token API (alchemy_getTokenBalances) — via the already
  //    configured transport, independent of finding the raw URL below.
  const testAddress = '0xff2605c1cFC8fF3b2c8Dfde91E72E98595676995' // the mock vault, holds a real token balance
  try {
    const result = await publicClient.request({
      method: 'alchemy_getTokenBalances' as any,
      params: [testAddress, 'erc20'] as any,
    } as any)
    console.log('alchemy_getTokenBalances: SUPPORTED —', JSON.stringify(result).slice(0, 300))
  } catch (e) {
    console.log('alchemy_getTokenBalances: NOT SUPPORTED —', (e as Error).message.slice(0, 300))
  }

  // 2. Prices API (REST, not RPC) — needs the raw key in the URL path, so
  //    it has to be located first. Tries the connection/provider/client
  //    objects at a few plausible nesting points; skips cleanly if none work
  //    rather than crashing the whole script.
  const candidates = [connection, (connection as any).provider, publicClient, (publicClient as any).transport]
  let rpcUrl: string | undefined
  for (const c of candidates) {
    rpcUrl = findUrl(c)
    if (rpcUrl) break
  }

  if (!rpcUrl) {
    console.log('Prices API: SKIPPED — could not locate the configured RPC URL to extract the key from')
    return
  }
  console.log('found RPC URL at:', redact(rpcUrl))

  const match = rpcUrl.match(/\/v2\/([^/]+)$/)
  if (!match) {
    console.log('Prices API: SKIPPED — found URL is not in the expected /v2/<key> shape')
    return
  }
  const apiKey = match[1]

  try {
    const res = await fetch(`https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: [{ network: 'arc-testnet', address: testAddress }] }),
    })
    const body = await res.text()
    console.log(`Prices API (by-address): HTTP ${res.status} —`, body.slice(0, 300))
  } catch (e) {
    console.log('Prices API (by-address): REQUEST FAILED —', (e as Error).message.slice(0, 300))
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
