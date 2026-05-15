import Link from 'next/link'
import { getCampaignAutomationOverview } from '@/lib/campaign-overview'

export default async function DashboardAutomationBanner() {
  const overview = await getCampaignAutomationOverview()

  return (
    <div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-200">Automation</h2>
            {overview.hasLiveCampaigns ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-300 border border-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {overview.liveCampaigns.length} live
              </span>
            ) : (
              <span className="text-xs text-gray-500">No campaigns sending</span>
            )}
            {overview.sendRunning && (
              <span className="text-xs text-indigo-300">Batch in progress…</span>
            )}
          </div>
          {overview.hasLiveCampaigns ? (
            <p className="text-xs text-gray-500 mt-1">
              {overview.totalRemaining.toLocaleString()} leads remaining across live campaigns.
              Cron runs hourly on weekdays during the send window.
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              Import a campaign and keep it unpaused to start automated outreach.
            </p>
          )}
        </div>
        <Link
          href="/campaigns"
          className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 text-center"
        >
          Manage campaigns
        </Link>
      </div>
    </div>
  )
}
