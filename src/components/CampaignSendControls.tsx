'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SendRunResult } from '@/lib/scheduler'

interface AutomationOverview {
  sendRunning: boolean
  inSendWindow: boolean
  hasLiveCampaigns: boolean
  totalRemaining: number
  sendWindow: { startHour: number; endHour: number; timezoneLabel: string; weekdaysOnly: boolean }
  liveCampaigns: Array<{ id: number; name: string; remaining: number }>
}

function formatSendResult(result: SendRunResult) {
  if (result.blockedReason) return result.blockedReason
  let msg = `Sent: ${result.sent} | Failed: ${result.failed} | Skipped: ${result.skipped}`
  if (result.truncated && result.queuedThisRun != null && result.maxSendsPerRun != null) {
    msg += ` · ${result.queuedThisRun - result.maxSendsPerRun} more queued for next run`
  }
  return msg
}

export default function CampaignSendControls() {
  const [overview, setOverview] = useState<AutomationOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    const res = await fetch('/api/send/status')
    if (res.ok) setOverview(await res.json())
  }, [])

  useEffect(() => {
    void refreshStatus()
    const id = setInterval(refreshStatus, 5000)
    return () => clearInterval(id)
  }, [refreshStatus])

  async function runSend(dryRun = false) {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/send/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setResult(data.error || res.statusText)
      } else {
        setResult(formatSendResult(data.result))
      }
    } catch (e) {
      setResult(String(e))
    } finally {
      setLoading(false)
      await refreshStatus()
    }
  }

  const sendRunning = overview?.sendRunning || loading
  const canStart =
    overview?.hasLiveCampaigns &&
    !sendRunning &&
    !loading

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 mb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-200">Campaign automation</h2>
            {overview?.hasLiveCampaigns ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-300 border border-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-400 border border-gray-700">
                No active campaigns
              </span>
            )}
            {overview?.sendRunning && (
              <span className="inline-flex items-center rounded-full bg-indigo-950 px-2.5 py-0.5 text-xs font-medium text-indigo-300 border border-indigo-800">
                Sending now…
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2 max-w-2xl">
            Once a campaign is <strong className="text-gray-400">Live</strong> (not paused, with leads remaining),
            hourly cron continues sending during {overview?.sendWindow.startHour ?? 8}:00–{overview?.sendWindow.endHour ?? 18}:00{' '}
            {overview?.sendWindow.timezoneLabel ?? 'PT'}
            {overview?.sendWindow.weekdaysOnly !== false ? ' · Mon–Fri' : ''}. Use Start Campaign once to kick off the next batch now.
          </p>
          {overview && overview.liveCampaigns.length > 0 && (
            <ul className="mt-3 text-xs text-gray-400 space-y-1">
              {overview.liveCampaigns.map((c) => (
                <li key={c.id}>
                  <span className="text-gray-300">{c.name}</span>
                  <span className="text-gray-600"> · {c.remaining.toLocaleString()} remaining</span>
                </li>
              ))}
            </ul>
          )}
          {!overview?.inSendWindow && overview?.hasLiveCampaigns && (
            <p className="text-xs text-amber-400/90 mt-2">Outside send window — cron will resume when the window opens.</p>
          )}
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => runSend(true)}
              disabled={sendRunning}
              className="px-3 py-1.5 text-sm rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Dry Run
            </button>
            <button
              type="button"
              onClick={() => runSend(false)}
              disabled={!canStart}
              className="px-4 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Starting…' : sendRunning && !loading ? 'Running…' : 'Start Campaign'}
            </button>
          </div>
          {result && <p className="text-xs text-gray-400 max-w-sm text-right">{result}</p>}
        </div>
      </div>
    </div>
  )
}
