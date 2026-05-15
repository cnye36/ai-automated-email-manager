'use client'
import { useState } from 'react'
import type { SendRunResult } from '@/lib/scheduler'

function formatSendResult(result: SendRunResult) {
  if (result.blockedReason) return result.blockedReason
  let msg = `Sent: ${result.sent} | Failed: ${result.failed} | Skipped: ${result.skipped}`
  if (result.truncated && result.queuedThisRun != null && result.maxSendsPerRun != null) {
    msg += ` · ${result.queuedThisRun - result.maxSendsPerRun} more queued for next run`
  }
  return msg
}

export default function SendTrigger() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

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
        setResult(`Error: ${data.error || res.statusText}`)
      } else {
        setResult(formatSendResult(data.result))
      }
    } catch (e) {
      setResult(`Error: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span className="text-sm text-gray-400">{result}</span>
      )}
      <button
        onClick={() => runSend(true)}
        disabled={loading}
        className="px-3 py-1.5 text-sm rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50"
      >
        Dry Run
      </button>
      <button
        onClick={() => runSend(false)}
        disabled={loading}
        className="px-4 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
      >
        {loading ? 'Sending…' : 'Run Send Queue'}
      </button>
    </div>
  )
}
