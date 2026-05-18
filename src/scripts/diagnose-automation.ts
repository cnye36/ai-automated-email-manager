/**
 * Print why automation may not be sending. Run:
 *   pnpm exec tsx --env-file=.env.local src/scripts/diagnose-automation.ts
 */
import { db } from '../lib/db/client'
import { campaigns, contacts, inboxes } from '../lib/db/schema'
import { and, count, eq, sql } from 'drizzle-orm'
import { getInboxConfigs } from '../lib/config'
import { getEffectiveDailyLimit } from '../lib/inbox-send-limit'
import { getDailyLimit, getWarmupDay } from '../lib/warmup'
import { getSendWindowSummary, isAllowedSendTime } from '../lib/scheduler'
import { getRemainingContactCount, isCampaignLive } from '../lib/campaign-status'

async function main() {
  const now = Math.floor(Date.now() / 1000)
  const sendWindow = getSendWindowSummary()
  const inWindow = isAllowedSendTime(new Date())

  console.log('=== Send automation diagnostic ===\n')
  console.log(`Now (unix): ${now} · ${new Date().toISOString()}`)
  console.log(
    `Send window: ${sendWindow.startHour}:00–${sendWindow.endHour}:00 ${sendWindow.timezoneLabel}` +
      (sendWindow.weekdaysOnly ? ' · Mon–Fri' : '') +
      ` · currently ${inWindow ? 'OPEN' : 'CLOSED'}`,
  )

  try {
    const configs = getInboxConfigs()
    console.log(`\nInbox config: ${configs.length} in mailbox JSON/env`)
    for (const c of configs) {
      const [row] = await db.select().from(inboxes).where(eq(inboxes.id, c.id))
      const warmupStart = row?.warmupStartDate ?? c.warmupStartDate
      const max = getDailyLimit(warmupStart)
      const effective = getEffectiveDailyLimit(warmupStart, row?.dailySendTarget)
      const sentToday = row?.sentToday ?? 0
      const dbActive = row?.active ?? c.active
      console.log(
        `  ${c.id}: config.active=${c.active} db.active=${dbActive} · ` +
          `sending ${effective}/day (max ${max}) · sent today ${sentToday} · remaining ${Math.max(0, effective - sentToday)}`,
      )
    }
  } catch (e) {
    console.error('\nInbox config ERROR (cron will fail on Vercel without INBOXES_JSON):', e)
  }

  const campaignRows = await db.select().from(campaigns)
  console.log(`\nCampaigns: ${campaignRows.length}`)
  for (const campaign of campaignRows) {
    const statusRows = await db
      .select({ status: contacts.status, count: count() })
      .from(contacts)
      .where(eq(contacts.campaignId, campaign.id))
      .groupBy(contacts.status)

    const live = isCampaignLive(campaign.active, statusRows)
    const remaining = getRemainingContactCount(statusRows)

    const [nullNext] = await db
      .select({ count: count() })
      .from(contacts)
      .where(
        sql`${contacts.campaignId} = ${campaign.id} AND ${contacts.status} = 'active' AND ${contacts.nextSendDate} IS NULL`,
      )

    const [dueNow] = await db
      .select({ count: count() })
      .from(contacts)
      .where(
        sql`${contacts.campaignId} = ${campaign.id} AND ${contacts.status} = 'active' AND ${contacts.nextSendDate} <= ${now}`,
      )

    const [pendingRow] = await db
      .select({ count: count() })
      .from(contacts)
      .where(and(eq(contacts.campaignId, campaign.id), eq(contacts.status, 'pending')))

    console.log(
      `\n  [${campaign.id}] ${campaign.name} · db.active=${campaign.active} · ${live ? 'LIVE' : 'not live'} · remaining ${remaining}`,
    )
    console.log(`    status: ${statusRows.map((r) => `${r.status}=${r.count}`).join(', ') || '(none)'}`)
    console.log(`    pending (need activation): ${pendingRow.count}`)
    console.log(`    active with NULL next_send_date: ${nullNext.count}`)
    console.log(`    active due now (next_send_date <= now): ${dueNow.count}`)
  }

  console.log('\n=== Likely blockers ===')
  if (!inWindow) console.log('- Outside send window (cron runs but sent: 0)')
  console.log('- GCP must hit POST /api/cron/send (not replies only)')
  console.log('- campaigns.active must be true in DB')
  console.log('- pending contacts only send after activation on a send run with inbox budget')
  console.log('\nManual test: curl -X POST https://YOUR-APP.vercel.app/api/cron/send -H "Authorization: Bearer $CRON_SECRET"')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
