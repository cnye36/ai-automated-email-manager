import 'dotenv/config'
import { checkAllReplies } from '../lib/imap'
import { buildAndRunSendQueue } from '../lib/scheduler'

async function main() {
  const ts = () => new Date().toISOString()
  console.log(`[${ts()}] === Daily Send Run Started ===`)

  // Step 1: Check for replies across all inboxes
  console.log(`[${ts()}] Checking replies...`)
  try {
    const replyResults = await checkAllReplies()
    const total = replyResults.reduce((s, r) => s + r.replies, 0)
    console.log(`[${ts()}] Replies found: ${total}`)
    replyResults.forEach((r) => {
      if (r.replies > 0) console.log(`  ${r.inbox}: ${r.replies} replies`)
    })
  } catch (err) {
    console.error(`[${ts()}] Reply check error:`, err)
  }

  // Step 2: Build and run send queue
  console.log(`[${ts()}] Running send queue...`)
  try {
    const result = await buildAndRunSendQueue()
    console.log(`[${ts()}] Send complete: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`)
    if (result.failed > 0) {
      const failures = result.details.filter((d) => !d.success)
      failures.forEach((f) => console.error(`  Contact ${f.contactId}: ${f.error}`))
    }
  } catch (err) {
    console.error(`[${ts()}] Send queue error:`, err)
  }

  console.log(`[${ts()}] === Daily Send Run Complete ===`)
  process.exit(0)
}

main()
