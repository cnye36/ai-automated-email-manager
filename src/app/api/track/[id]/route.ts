import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sentEmails } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

// 1×1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const [row] = await db
      .select()
      .from(sentEmails)
      .where(eq(sentEmails.trackingPixelId, id))
      .limit(1)

    if (row && !row.openedAt) {
      await db
        .update(sentEmails)
        .set({ openedAt: Math.floor(Date.now() / 1000) })
        .where(eq(sentEmails.id, row.id))
    }
  } catch {
    // Never fail a tracking request visibly
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  })
}
