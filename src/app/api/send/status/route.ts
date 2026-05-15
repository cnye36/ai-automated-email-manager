import { NextResponse } from 'next/server'
import { getCampaignAutomationOverview } from '@/lib/campaign-overview'

export const dynamic = 'force-dynamic'

export async function GET() {
  const overview = await getCampaignAutomationOverview()
  return NextResponse.json(overview)
}
