import { NextRequest, NextResponse } from 'next/server'
import { checkAllReplies } from '@/lib/imap'
import { isAuthorizedCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await checkAllReplies()
    const totalReplies = results.reduce((sum, row) => sum + row.replies, 0)
    const totalNewReplies = results.reduce((sum, row) => sum + row.newReplies, 0)

    return NextResponse.json({ ok: true, results, totalReplies, totalNewReplies })
  } catch (err) {
    console.error('Cron reply check error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
