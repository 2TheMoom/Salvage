import { NextResponse } from 'next/server'
import { scanContract, fetchAbi } from '@/lib/scanner'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// TEMPORARY — isolate whether scanContract fails even when it's the ONLY
// thing this invocation does. Delete once resolved.
export async function GET() {
  const address = '0xd21c72FBE27B6Cd26A5DBf49148B7bA0a4CAed27'
  try {
    const result = await scanContract(address, 'arc')
    return NextResponse.json({ isVerified: result.isVerified, tokenName: result.tokenName })
  } catch (e) {
    return NextResponse.json({ threw: e instanceof Error ? e.message : String(e) })
  }
}
