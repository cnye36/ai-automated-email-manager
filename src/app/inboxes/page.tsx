'use client'
import { useState, useEffect, useCallback } from 'react'

interface InboxStatus {
  id: string
  address: string
  active: boolean
  warmupStartDate: string
  warmupDay: number
  warmupMaxLimit: number
  dailySendTarget: number | null
  effectiveDailyLimit: number
  dailyLimit: number
  sentToday: number
  totalSent: number
  bounceCount: number
  opens: number
  replies: number
  bounces: number
  openRate: string
  replyRate: string
  bounceRate: string
}

const WARMUP_DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 14, 21, 28, 29]

export default function InboxesPage() {
  const [inboxes, setInboxes] = useState<InboxStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [savingWarmup, setSavingWarmup] = useState<string | null>(null)
  const [resettingAll, setResettingAll] = useState(false)
  const [warmupDraft, setWarmupDraft] = useState<Record<string, number>>({})
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/inboxes')
    const data: InboxStatus[] = await res.json()
    setInboxes(data)
    setWarmupDraft((prev) => {
      const next = { ...prev }
      for (const inbox of data) {
        if (next[inbox.id] === undefined) next[inbox.id] = inbox.warmupDay
      }
      return next
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function patchInbox(
    id: string,
    patch: { active?: boolean; warmupDay?: number; resetSentToday?: boolean },
  ) {
    const res = await fetch('/api/inboxes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || res.statusText)
    return data
  }

  async function toggleInbox(id: string, current: boolean) {
    setToggling(id)
    setMessage(null)
    try {
      await patchInbox(id, { active: !current })
      await load()
    } catch (e) {
      setMessage(String(e))
    } finally {
      setToggling(null)
    }
  }

  async function setWarmupDay(id: string, day: number, resetSentToday = false) {
    setSavingWarmup(id)
    setMessage(null)
    try {
      const data = await patchInbox(id, { warmupDay: day, resetSentToday })
      setMessage(`${id}: warmup day ${data.warmupDay} (${data.dailyLimit}/day)`)
      await load()
    } catch (e) {
      setMessage(String(e))
    } finally {
      setSavingWarmup(null)
    }
  }

  async function resetAllToDayOne() {
    if (!confirm('Reset all inboxes to warmup day 1 (today) and clear sent-today counts?')) return
    setResettingAll(true)
    setMessage(null)
    try {
      const res = await fetch('/api/inboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-all-warmup' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setMessage(`Reset ${data.inboxCount} inboxes to day 1 (start ${data.warmupStartDate})`)
      await load()
    } catch (e) {
      setMessage(String(e))
    } finally {
      setResettingAll(false)
    }
  }

  const totalBudget = inboxes.filter((i) => i.active).reduce((s, i) => s + i.effectiveDailyLimit, 0)

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Inboxes</h1>
          <p className="text-gray-400 text-sm mt-1">
            {inboxes.filter((i) => i.active).length} active · {totalBudget} emails/day target ·{' '}
            <a href="/settings" className="text-indigo-400 hover:text-indigo-300">Send targets</a>
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Warmup days count Mon–Fri only (send timezone). Weekends do not advance the ramp.
          </p>
        </div>
        <button
          type="button"
          onClick={resetAllToDayOne}
          disabled={resettingAll || loading}
          className="shrink-0 rounded-md bg-amber-800 hover:bg-amber-700 px-4 py-2 text-sm font-medium text-amber-100 disabled:opacity-50"
        >
          {resettingAll ? 'Resetting…' : 'Reset all to day 1'}
        </button>
      </div>

      {message && (
        <p className="mb-4 text-sm text-gray-400 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2">{message}</p>
      )}

      <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4 mb-6 text-sm text-amber-300">
        <strong>New campaign / fresh ramp:</strong> use <strong>Reset all to day 1</strong> or set each inbox below.
        That updates the stored warmup start date (not <code className="bg-amber-900/50 px-1 rounded">inboxes.json</code>).
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        <div className="space-y-3">
          {inboxes.map((inbox) => (
            <div
              key={inbox.id}
              className={`bg-gray-900 border rounded-lg p-5 ${
                inbox.active ? 'border-gray-800' : 'border-gray-800 opacity-60'
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="font-mono text-sm text-indigo-300">{inbox.address}</span>
                    <span className="text-xs text-gray-600 font-mono">{inbox.id}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${inbox.active ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                      {inbox.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                    <span>Warmup Day <strong className="text-gray-300">{inbox.warmupDay}</strong></span>
                    <span>
                      Sending <strong className="text-emerald-400">{inbox.effectiveDailyLimit}/day</strong>
                      {inbox.dailySendTarget != null ? (
                        <span className="text-gray-600"> (target {inbox.dailySendTarget})</span>
                      ) : null}
                    </span>
                    <span>Max <strong className="text-gray-300">{inbox.warmupMaxLimit}/day</strong></span>
                    <span>Sent Today <strong className="text-gray-300">{inbox.sentToday}</strong></span>
                    <span>Total <strong className="text-gray-300">{inbox.totalSent.toLocaleString()}</strong></span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 font-mono">Start: {inbox.warmupStartDate}</p>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mt-1.5">
                    <span className="text-gray-500">Opens <strong className="text-blue-400">{inbox.opens} ({inbox.openRate}%)</strong></span>
                    <span className="text-gray-500">Replies <strong className="text-emerald-400">{inbox.replies} ({inbox.replyRate}%)</strong></span>
                    <span className="text-gray-500">
                      Bounces{' '}
                      <strong className={
                        Number(inbox.bounceRate) >= 5 ? 'text-red-400' :
                        Number(inbox.bounceRate) >= 2 ? 'text-amber-400' :
                        'text-gray-300'
                      }>
                        {inbox.bounces} ({inbox.bounceRate}%)
                      </strong>
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="flex-1 bg-gray-800 rounded-full h-1.5 max-w-[240px]">
                      <div
                        className="bg-indigo-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (inbox.warmupDay / 28) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">
                      {inbox.warmupDay >= 28 ? 'Full warmup tier' : `~${Math.max(0, 28 - inbox.warmupDay)} business days to day 28`}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:items-end shrink-0">
                  <button
                    onClick={() => toggleInbox(inbox.id, inbox.active)}
                    disabled={toggling === inbox.id || savingWarmup === inbox.id}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                      inbox.active
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        : 'bg-green-800 hover:bg-green-700 text-green-200'
                    }`}
                  >
                    {toggling === inbox.id ? '…' : inbox.active ? 'Pause' : 'Resume'}
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-800 flex flex-wrap items-end gap-2">
                <label className="text-xs text-gray-500">
                  Set warmup day
                  <select
                    value={warmupDraft[inbox.id] ?? inbox.warmupDay}
                    onChange={(e) => setWarmupDraft((d) => ({ ...d, [inbox.id]: Number(e.target.value) }))}
                    className="mt-1 block rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-gray-200"
                  >
                    {WARMUP_DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>Day {d}</option>
                    ))}
                    {!WARMUP_DAY_OPTIONS.includes(inbox.warmupDay) && (
                      <option value={inbox.warmupDay}>Day {inbox.warmupDay} (current)</option>
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={savingWarmup === inbox.id}
                  onClick={() => setWarmupDay(inbox.id, warmupDraft[inbox.id] ?? inbox.warmupDay, false)}
                  className="rounded-md bg-indigo-700 hover:bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {savingWarmup === inbox.id ? '…' : 'Apply'}
                </button>
                <button
                  type="button"
                  disabled={savingWarmup === inbox.id}
                  onClick={() => setWarmupDay(inbox.id, 1, true)}
                  className="rounded-md bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-sm text-gray-200 disabled:opacity-50"
                >
                  Day 1 + clear sent today
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
