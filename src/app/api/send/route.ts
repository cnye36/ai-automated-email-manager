import { NextRequest, NextResponse } from 'next/server'
import { buildAndRunSendQueue } from '@/lib/scheduler'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    const result = await buildAndRunSendQueue(dryRun)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Send error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
