import { NextRequest, NextResponse } from 'next/server'
import { importXlsx } from '@/lib/importer'
import { writeFile } from 'fs/promises'
import path from 'path'
import os from 'os'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const campaignName = formData.get('campaignName') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!campaignName) return NextResponse.json({ error: 'No campaign name provided' }, { status: 400 })

    // Write to temp file for ExcelJS to read
    const bytes = await file.arrayBuffer()
    const tmpPath = path.join(os.tmpdir(), `import-${Date.now()}.xlsx`)
    await writeFile(tmpPath, Buffer.from(bytes))

    const result = await importXlsx(tmpPath, campaignName)

    return NextResponse.json(result)
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
