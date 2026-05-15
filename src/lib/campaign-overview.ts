import { db } from './db/client'
import { campaigns, contacts } from './db/schema'
import { count, eq } from 'drizzle-orm'
import { countByStatus, getRemainingContactCount, isCampaignLive } from './campaign-status'
import { getSendWindowSummary, isAllowedSendTime } from './scheduler'
import { getSendLockStatus } from './send-lock'

export async function getCampaignAutomationOverview() {
  const rows = await db.select().from(campaigns).orderBy(campaigns.name)
  const sendWindow = getSendWindowSummary()
  const lock = await getSendLockStatus()
  const inSendWindow = isAllowedSendTime(new Date())

  const liveCampaigns = await Promise.all(
    rows.map(async (campaign) => {
      const statusRows = await db
        .select({ status: contacts.status, count: count() })
        .from(contacts)
        .where(eq(contacts.campaignId, campaign.id))
        .groupBy(contacts.status)

      const remaining = getRemainingContactCount(statusRows)

      return {
        id: campaign.id,
        name: campaign.name,
        active: campaign.active,
        remaining,
        pending: countByStatus(statusRows, 'pending'),
        activeContacts: countByStatus(statusRows, 'active'),
        complete: countByStatus(statusRows, 'complete'),
        live: isCampaignLive(campaign.active, statusRows),
      }
    }),
  )

  const live = liveCampaigns.filter((c) => c.live)

  return {
    sendRunning: lock.running,
    inSendWindow,
    sendWindow,
    liveCampaigns: live,
    hasLiveCampaigns: live.length > 0,
    totalRemaining: live.reduce((sum, c) => sum + c.remaining, 0),
  }
}
