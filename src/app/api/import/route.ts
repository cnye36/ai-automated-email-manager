import { NextRequest, NextResponse } from 'next/server'
import { importFile } from '@/lib/importer'
import { writeFile } from 'fs/promises'
import path from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const campaignName = formData.get('campaignName') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!campaignName) return NextResponse.json({ error: 'No campaign name provided' }, { status: 400 })

    const ext = path.extname(file.name).toLowerCase()
    if (!['.csv', '.xlsx', '.xlsm'].includes(ext)) {
      return NextResponse.json({ error: 'Upload a .csv, .xlsx, or .xlsm file' }, { status: 400 })
    }

    // Write to temp file for ExcelJS to read with the correct parser.
    const bytes = await file.arrayBuffer()
    const tmpPath = path.join(os.tmpdir(), `import-${Date.now()}${ext}`)
    await writeFile(tmpPath, Buffer.from(bytes))

    const result = await importFile(tmpPath, campaignName, file.name)

    return NextResponse.json(result)
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
