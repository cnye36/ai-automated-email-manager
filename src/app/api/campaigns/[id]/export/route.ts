import { NextRequest, NextResponse } from 'next/server'
import { exportCampaignToBuffer } from '@/lib/campaign-export'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const campaignId = Number(id)
    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const formatParam = req.nextUrl.searchParams.get('format')?.toLowerCase()
    const format = formatParam === 'csv' ? 'csv' : 'xlsx'

    const { buffer, fileName, rowCount } = await exportCampaignToBuffer(campaignId, format)
    const contentType =
      format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Export-Row-Count': String(rowCount),
      },
    })
  } catch (err) {
    console.error('Campaign export error:', err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
