'use client'
import { useState } from 'react'
import { runSendQueueAction } from '@/app/actions'

export default function SendTrigger() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function runSend(dryRun = false) {
    setLoading(true)
    setResult(null)
    try {
      const data = await runSendQueueAction(dryRun)
      if (!data.ok) {
        setResult(`Error: ${data.error}`)
      } else {
        const result = data.result
        setResult(result.blockedReason
          ? result.blockedReason
          : `Sent: ${result.sent} | Failed: ${result.failed} | Skipped: ${result.skipped}`)
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
