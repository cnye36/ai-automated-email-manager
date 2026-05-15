import { db } from '@/lib/db/client'
import { contacts, sentEmails, inboxes } from '@/lib/db/schema'
import { count, gte, isNotNull } from 'drizzle-orm'
import { getInboxConfigs } from '@/lib/config'
import { getDailyLimit, getWarmupDay } from '@/lib/warmup'
import { getSendWindowSummary } from '@/lib/scheduler'
import { startOfTodayInSendTimezone } from '@/lib/send-timezone'
import DashboardAutomationBanner from '@/components/DashboardAutomationBanner'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getStats() {
  const todayStart = startOfTodayInSendTimezone()
  const [totalContacts] = await db.select({ count: count() }).from(contacts)
  const [sentToday] = await db.select({ count: count() }).from(sentEmails).where(gte(sentEmails.sentAt, todayStart))
  const [totalSent] = await db.select({ count: count() }).from(sentEmails)
  const [totalOpened] = await db.select({ count: count() }).from(sentEmails).where(isNotNull(sentEmails.openedAt))
  const [totalReplied] = await db.select({ count: count() }).from(sentEmails).where(isNotNull(sentEmails.repliedAt))
  const statusRows = await db.select({ status: contacts.status, count: count() }).from(contacts).groupBy(contacts.status)

  return {
    totalContacts: totalContacts.count,
    sentToday: sentToday.count,
    totalSent: totalSent.count,
    totalOpened: totalOpened.count,
    totalReplied: totalReplied.count,
    openRate: totalSent.count > 0 ? ((totalOpened.count / totalSent.count) * 100).toFixed(1) : '0.0',
    replyRate: totalSent.count > 0 ? ((totalReplied.count / totalSent.count) * 100).toFixed(1) : '0.0',
    statusRows,
  }
}

async function getInboxSummary() {
  const configs = getInboxConfigs()
  const rows = await db.select().from(inboxes)
  const rowMap = new Map(rows.map((r) => [r.id, r]))

  return configs.map((c) => {
    const row = rowMap.get(c.id)
    return {
      id: c.id,
      address: c.address,
      active: row?.active ?? c.active,
      warmupDay: getWarmupDay(c.warmupStartDate),
      dailyLimit: getDailyLimit(c.warmupStartDate),
      sentToday: row?.sentToday ?? 0,
      totalSent: row?.totalSent ?? 0,
    }
  })
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-sm text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default async function Dashboard() {
  const [stats, inboxSummary] = await Promise.all([getStats(), getInboxSummary()])
  const sendWindow = getSendWindowSummary()

  const totalBudgetToday = inboxSummary.filter((i) => i.active).reduce((s, i) => s + i.dailyLimit, 0)

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Sending window: {sendWindow.startHour}:00-{sendWindow.endHour}:00 {sendWindow.timezoneLabel}
            {sendWindow.weekdaysOnly ? ' · Mon-Fri only' : ''}
          </p>
        </div>
        <Link
          href="/campaigns#new-campaign"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          New Campaign
        </Link>
      </div>

      <DashboardAutomationBanner />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Contacts" value={stats.totalContacts.toLocaleString()} />
        <StatCard label="Sent Today" value={stats.sentToday} sub={`of ${totalBudgetToday} budget`} />
        <StatCard label="Open Rate" value={`${stats.openRate}%`} sub={`${stats.totalOpened} opens`} />
        <StatCard label="Reply Rate" value={`${stats.replyRate}%`} sub={`${stats.totalReplied} replies`} />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg mb-8">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">Inbox Warmup Status</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase">
                <th className="text-left px-5 py-3">Inbox</th>
                <th className="text-left px-5 py-3">Day</th>
                <th className="text-left px-5 py-3">Daily Limit</th>
                <th className="text-left px-5 py-3">Sent Today</th>
                <th className="text-left px-5 py-3">Total Sent</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {inboxSummary.map((inbox) => (
                <tr key={inbox.id} className="hover:bg-gray-800/50">
                  <td className="px-5 py-3 font-mono text-xs text-indigo-300">{inbox.address}</td>
                  <td className="px-5 py-3 text-gray-300">Day {inbox.warmupDay}</td>
                  <td className="px-5 py-3 text-gray-300">{inbox.dailyLimit}/day</td>
                  <td className="px-5 py-3 text-gray-300">{inbox.sentToday}</td>
                  <td className="px-5 py-3 text-gray-300">{inbox.totalSent}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${inbox.active ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                      {inbox.active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">Contact Status Breakdown</h2>
        </div>
        <div className="px-5 py-4 flex flex-wrap gap-4">
          {stats.statusRows.map((row) => (
            <div key={row.status} className="flex items-center gap-2">
              <span className="text-gray-400 text-sm capitalize">{row.status}:</span>
              <span className="text-white font-semibold text-sm">{row.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
