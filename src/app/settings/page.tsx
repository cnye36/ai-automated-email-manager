'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface InboxStatus {
  id: string
  address: string
  active: boolean
  warmupMaxLimit: number
  dailySendTarget: number | null
  effectiveDailyLimit: number
  sentToday: number
}

export default function SettingsPage() {
  const [inboxes, setInboxes] = useState<InboxStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [targetDraft, setTargetDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/inboxes')
    const data: InboxStatus[] = await res.json()
    setInboxes(data)
    setTargetDraft((prev) => {
      const next = { ...prev }
      for (const inbox of data) {
        if (next[inbox.id] === undefined) {
          next[inbox.id] =
            inbox.dailySendTarget != null ? String(inbox.dailySendTarget) : ''
        }
      }
      return next
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveTarget(id: string, useMax: boolean) {
    const inbox = inboxes.find((i) => i.id === id)
    if (!inbox) return

    let dailySendTarget: number | null = null
    if (!useMax) {
      const raw = targetDraft[id]?.trim()
      const n = raw === '' ? NaN : Number(raw)
      if (!Number.isFinite(n) || n < 1 || n > inbox.warmupMaxLimit) {
        setMessage(`Enter a number from 1 to ${inbox.warmupMaxLimit} for ${inbox.address}`)
        return
      }
      dailySendTarget = Math.floor(n)
    }

    setSaving(id)
    setMessage(null)
    try {
      const res = await fetch('/api/inboxes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, dailySendTarget }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setMessage(
        `${id}: sending ${data.effectiveDailyLimit}/day (warmup max ${data.warmupMaxLimit})`,
      )
      await load()
    } catch (e) {
      setMessage(String(e))
    } finally {
      setSaving(null)
    }
  }

  const totalEffective = inboxes
    .filter((i) => i.active)
    .reduce((s, i) => s + i.effectiveDailyLimit, 0)

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      <p className="text-gray-400 text-sm mb-6">
        Control how many emails each inbox sends per day. Warmup sets the ceiling; your target is what the scheduler uses.
      </p>

      <div className="bg-indigo-900/25 border border-indigo-800/50 rounded-lg p-4 mb-6 text-sm text-indigo-200">
        <p className="font-medium text-indigo-100 mb-2">Send priority (always on)</p>
        <ul className="list-disc list-inside space-y-1 text-indigo-200/90">
          <li>Follow-ups (email 2 and 3) are sent before new leads (email 1).</li>
          <li>Within each group, the oldest due contacts go first.</li>
          <li>Leftover budget after follow-ups is used for new leads.</li>
        </ul>
        <p className="text-xs text-indigo-300/80 mt-3">
          Tip: set targets below the warmup max (e.g. 3 when max is 5) so follow-up days can mix in new leads.{' '}
          <Link href="/inboxes" className="underline hover:text-indigo-100">
            Warmup days on Inboxes
          </Link>
        </p>
      </div>

      {message && (
        <p className="mb-4 text-sm text-gray-400 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2">
          {message}
        </p>
      )}

      <p className="text-xs text-gray-500 mb-4">
        {inboxes.filter((i) => i.active).length} active inboxes · {totalEffective} emails/day scheduled capacity
      </p>

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
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="font-mono text-sm text-indigo-300">{inbox.address}</span>
                <span className="text-xs text-gray-600 font-mono">{inbox.id}</span>
                {!inbox.active && (
                  <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-400">Paused</span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 mb-4">
                <span>
                  Warmup max <strong className="text-gray-300">{inbox.warmupMaxLimit}/day</strong>
                </span>
                <span>
                  Sending <strong className="text-emerald-400">{inbox.effectiveDailyLimit}/day</strong>
                </span>
                <span>
                  Sent today <strong className="text-gray-300">{inbox.sentToday}</strong>
                </span>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-gray-500">
                  Daily send target
                  <input
                    type="number"
                    min={1}
                    max={inbox.warmupMaxLimit}
                    placeholder={`Max ${inbox.warmupMaxLimit}`}
                    value={targetDraft[inbox.id] ?? ''}
                    onChange={(e) =>
                      setTargetDraft((d) => ({ ...d, [inbox.id]: e.target.value }))
                    }
                    className="mt-1 block w-24 rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-gray-200"
                  />
                </label>
                <button
                  type="button"
                  disabled={saving === inbox.id}
                  onClick={() => saveTarget(inbox.id, false)}
                  className="rounded-md bg-indigo-700 hover:bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {saving === inbox.id ? '…' : 'Save target'}
                </button>
                <button
                  type="button"
                  disabled={saving === inbox.id}
                  onClick={() => saveTarget(inbox.id, true)}
                  className="rounded-md bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-sm text-gray-200 disabled:opacity-50"
                >
                  Use warmup max
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}