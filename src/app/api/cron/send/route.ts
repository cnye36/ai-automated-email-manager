import { NextRequest, NextResponse } from 'next/server'
import { checkAllReplies } from '@/lib/imap'
import { buildAndRunSendQueue } from '@/lib/scheduler'
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
    const replyResults = await checkAllReplies()
    const sendResult = await buildAndRunSendQueue(false)

    return NextResponse.json({
      ok: true,
      replies: {
        results: replyResults,
        totalReplies: replyResults.reduce((sum, row) => sum + row.replies, 0),
        totalNewReplies: replyResults.reduce((sum, row) => sum + row.newReplies, 0),
      },
      send: sendResult,
    })
  } catch (err) {
    console.error('Cron send error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
