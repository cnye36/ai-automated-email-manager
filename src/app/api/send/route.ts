import { NextRequest, NextResponse } from 'next/server'
import { buildAndRunSendQueue } from '@/lib/scheduler'
import { parseSendQueueOptionsFromBody } from '@/lib/send-options'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    let devOptions
    try {
      devOptions = parseSendQueueOptionsFromBody(body as Record<string, unknown>) ?? undefined
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 403 })
    }

    const result = await buildAndRunSendQueue(dryRun, devOptions)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Send error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
