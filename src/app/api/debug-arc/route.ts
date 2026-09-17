import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// TEMPORARY diagnostic route — investigating why the deployed server sees
// Arc contracts as unverified when the same Etherscan call succeeds from
// a local machine. Delete once resolved.
export async function GET() {
  const address = '0xd21c72FBE27B6Cd26A5DBf49148B7bA0a4CAed27'
  const key = process.env.ETHERSCAN_API_KEY || ''
  const url = `https://api.etherscan.io/v2/api?chainid=5042&module=contract&action=getabi&address=${address}&apikey=${key}`

  const out: Record<string, unknown> = {
    keyPresent: Boolean(key),
    keyLength: key.length,
    keyTail: key.slice(-4),
  }

  try {
    const res = await fetch(url, { cache: 'no-store' })
    out.httpStatus = res.status
    out.httpOk = res.ok
    const text = await res.text()
    out.rawTextLength = text.length
    out.rawTextPreview = text.slice(0, 500)
    try {
      out.parsed = JSON.parse(text)
    } catch (parseErr) {
      out.parseError = parseErr instanceof Error ? parseErr.message : String(parseErr)
    }
  } catch (fetchErr) {
    out.fetchError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    out.fetchErrorName = fetchErr instanceof Error ? fetchErr.name : undefined
    out.fetchErrorStack = fetchErr instanceof Error ? fetchErr.stack : undefined
  }

  return NextResponse.json(out)
}
