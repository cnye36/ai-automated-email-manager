import { NextRequest, NextResponse } from 'next/server'
import { syncCampaignFromFile } from '@/lib/campaign-sync'
import { writeFile } from 'fs/promises'
import path from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const campaignId = Number(id)
    if (!Number.isInteger(campaignId) || campaignId <= 0) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!['.csv', '.xlsx', '.xlsm'].includes(ext)) {
      return NextResponse.json({ error: 'Upload a .csv, .xlsx, or .xlsm file' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const tmpPath = path.join(os.tmpdir(), `sync-${campaignId}-${Date.now()}${ext}`)
    await writeFile(tmpPath, Buffer.from(bytes))

    const result = await syncCampaignFromFile(campaignId, tmpPath)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Campaign sync error:', err)
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
