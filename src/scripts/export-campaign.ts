/**
 * Export a campaign to xlsx/csv on disk (for cron on GCP).
 *
 * Usage:
 *   pnpm run export-campaign -- --campaign-id=12 --out=./exports/campaign-12.xlsx
 *   pnpm run export-campaign -- --campaign-id=12 --format=csv --out=./exports/campaign-12.csv
 */
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { exportCampaignToBuffer } from '../lib/campaign-export'

function parseArgs(argv: string[]) {
  let campaignId: number | null = null
  let outPath: string | null = null
  let format: 'xlsx' | 'csv' = 'xlsx'

  for (const arg of argv) {
    if (arg.startsWith('--campaign-id=')) {
      campaignId = Number(arg.slice('--campaign-id='.length))
    } else if (arg.startsWith('--out=')) {
      outPath = arg.slice('--out='.length)
    } else if (arg.startsWith('--format=')) {
      const f = arg.slice('--format='.length).toLowerCase()
      if (f === 'csv' || f === 'xlsx') format = f
    }
  }

  return { campaignId, outPath, format }
}

async function main() {
  const { campaignId, outPath, format } = parseArgs(process.argv.slice(2))

  if (!campaignId || !Number.isInteger(campaignId) || campaignId <= 0) {
    console.error('Missing or invalid --campaign-id=<number>')
    process.exit(1)
  }

  const { buffer, fileName, rowCount } = await exportCampaignToBuffer(campaignId, format)
  const target =
    outPath ??
    path.join(process.cwd(), 'exports', fileName)

  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, buffer)
  console.log(`Exported ${rowCount} contacts to ${target}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
