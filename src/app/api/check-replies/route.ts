import { NextRequest, NextResponse } from 'next/server'
import { checkAllReplies } from '@/lib/imap'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await checkAllReplies()
    const totalReplies = results.reduce((sum, r) => sum + r.replies, 0)
    const totalBounces = results.reduce((sum, r) => sum + r.bounces, 0)
    const totalNewBounces = results.reduce((sum, r) => sum + r.newBounces, 0)
    return NextResponse.json({ results, totalReplies, totalBounces, totalNewBounces })
  } catch (err) {
    console.error('Reply check error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
