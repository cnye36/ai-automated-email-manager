import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { buildAndRunSendQueue } from '@/lib/scheduler'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const result = await buildAndRunSendQueue(dryRun)
    revalidatePath('/')
    revalidatePath('/contacts')
    revalidatePath('/campaigns')
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('Send run error:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
