'use client'
import { useState, useEffect, useCallback } from 'react'

interface InboxStatus {
  id: string
  address: string
  active: boolean
  warmupStartDate: string
  warmupDay: number
  dailyLimit: number
  sentToday: number
  totalSent: number
}

export default function InboxesPage() {
  const [inboxes, setInboxes] = useState<InboxStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/inboxes')
    setInboxes(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function toggleInbox(id: string, current: boolean) {
    setToggling(id)
    await fetch('/api/inboxes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: !current }),
    })
    await load()
    setToggling(null)
  }

  const totalBudget = inboxes.filter((i) => i.active).reduce((s, i) => s + i.dailyLimit, 0)

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Inboxes</h1>
          <p className="text-gray-400 text-sm mt-1">
            {inboxes.filter((i) => i.active).length} active · {totalBudget} emails/day total budget
          </p>
        </div>
      </div>

      <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4 mb-6 text-sm text-amber-300">
        <strong>To add a new inbox:</strong> Add an entry to <code className="bg-amber-900/50 px-1 rounded">config/inboxes.json</code> and restart the server. The inbox will automatically appear here.
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        <div className="space-y-3">
          {inboxes.map((inbox) => (
            <div
              key={inbox.id}
              className={`bg-gray-900 border rounded-lg p-5 flex items-center justify-between ${
                inbox.active ? 'border-gray-800' : 'border-gray-800 opacity-60'
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm text-indigo-300">{inbox.address}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${inbox.active ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                    {inbox.active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="flex gap-6 text-xs text-gray-500">
                  <span>Warmup Day <strong className="text-gray-300">{inbox.warmupDay}</strong></span>
                  <span>Daily Limit <strong className="text-gray-300">{inbox.dailyLimit}/day</strong></span>
                  <span>Sent Today <strong className="text-gray-300">{inbox.sentToday}</strong></span>
                  <span>Total Sent <strong className="text-gray-300">{inbox.totalSent.toLocaleString()}</strong></span>
                </div>

                {/* Warmup progress bar */}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5 max-w-[240px]">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full"
                      style={{ width: `${Math.min(100, (inbox.warmupDay / 28) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    {inbox.warmupDay >= 28 ? 'Full warmup' : `${28 - inbox.warmupDay} days to full`}
                  </span>
                </div>
              </div>

              <button
                onClick={() => toggleInbox(inbox.id, inbox.active)}
                disabled={toggling === inbox.id}
                className={`ml-6 px-4 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                  inbox.active
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    : 'bg-green-800 hover:bg-green-700 text-green-200'
                }`}
              >
                {toggling === inbox.id ? '…' : inbox.active ? 'Pause' : 'Resume'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
