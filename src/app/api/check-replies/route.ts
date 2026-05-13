import { NextRequest, NextResponse } from 'next/server'
import { checkAllReplies } from '@/lib/imap'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await checkAllReplies()
    const totalReplies = results.reduce((sum, r) => sum + r.replies, 0)
    return NextResponse.json({ results, totalReplies })
  } catch (err) {
    console.error('Reply check error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
