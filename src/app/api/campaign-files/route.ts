import { NextRequest, NextResponse } from 'next/server'
import { readdir } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

const CAMPAIGN_DIR = path.join(process.cwd(), 'campaigns')
const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xlsm'])

export async function GET() {
  try {
    const entries = await readdir(CAMPAIGN_DIR, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort()

    return NextResponse.json({ files })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ files: [] })
    }
    console.error('Campaign files error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fileName, campaignName } = await req.json()
    if (typeof fileName !== 'string' || !fileName) {
      return NextResponse.json({ error: 'Missing fileName' }, { status: 400 })
    }
    if (typeof campaignName !== 'string' || !campaignName.trim()) {
      return NextResponse.json({ error: 'Missing campaignName' }, { status: 400 })
    }

    const safeName = path.basename(fileName)
    const ext = path.extname(safeName).toLowerCase()
    if (safeName !== fileName || !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: 'Invalid campaign file' }, { status: 400 })
    }

    const { importFile } = await import('@/lib/importer')
    const result = await importFile(path.join(CAMPAIGN_DIR, safeName), campaignName.trim())
    return NextResponse.json(result)
  } catch (err) {
    console.error('Local import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
