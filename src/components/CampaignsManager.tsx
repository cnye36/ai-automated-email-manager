'use client'

import { FormEvent, useEffect, useState } from 'react'
import CampaignSendControls from '@/components/CampaignSendControls'

export interface CampaignRow {
  id: number
  name: string
  fileName: string | null
  importedAt: number | null
  totalContacts: number | null
  active: boolean | null
  remainingContacts: number
  isLive: boolean
  sendingLabel: string
  sentEmails: number
  openCount: number
  replyCount: number
  bounceCount: number
  openRate: string
  replyRate: string
  bounceRate: string
  assignedInboxIds: string[]
  emailCoverage: Array<{ step: number; complete: number; subjectOnly: number; bodyOnly: number }>
  previewContact: {
    firstName: string | null
    lastName: string | null
    primaryEmail: string
    companyName: string | null
    emails: Array<{ step: number; subject: string | null; body: string | null }>
  } | null
  statusBreakdown: Array<{ status: string | null; count: number }>
}

interface ImportResult {
  imported: number
  skipped: number
  duplicates: number
  errors: string[]
}

interface InboxOption {
  id: string
  address: string
  active: boolean
}

function statusText(rows: CampaignRow['statusBreakdown']) {
  if (rows.length === 0) return 'No contacts'
  return rows.map((row) => `${row.status || 'pending'} ${row.count}`).join(' · ')
}

export default function CampaignsManager({
  initialCampaigns,
  initialLocalFiles,
}: {
  initialCampaigns: CampaignRow[]
  initialLocalFiles: string[]
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [localFiles, setLocalFiles] = useState(initialLocalFiles)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<number | 'all' | null>(null)
  const [toggling, setToggling] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<CampaignRow | null>(null)
  const [inboxOptions, setInboxOptions] = useState<InboxOption[]>([])
  const [assigningCampaignId, setAssigningCampaignId] = useState<number | null>(null)
  const [savingInboxes, setSavingInboxes] = useState(false)
  const [selectedInboxIds, setSelectedInboxIds] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/inboxes')
      .then((r) => r.json())
      .then((data: InboxOption[]) => setInboxOptions(data.map((i) => ({ id: i.id, address: i.address, active: i.active }))))
      .catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    const [campaignRes, filesRes, inboxRes] = await Promise.all([
      fetch('/api/campaigns'),
      fetch('/api/campaign-files'),
      fetch('/api/inboxes'),
    ])
    setCampaigns(await campaignRes.json())
    const filesData = await filesRes.json()
    setLocalFiles(filesData.files || [])
    const inboxData = await inboxRes.json()
    setInboxOptions(inboxData.map((i: InboxOption) => ({ id: i.id, address: i.address, active: i.active })))
    setLoading(false)
  }

  async function uploadCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUploading(true)
    setMessage(null)

    const form = event.currentTarget
    const formData = new FormData(form)

    try {
      const res = await fetch('/api/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessage(`Import failed: ${data.error || res.statusText}`)
      } else {
        const result = data as ImportResult
        const parts = [`Imported ${result.imported} contacts.`]
        if (result.duplicates > 0) parts.push(`${result.duplicates} duplicates skipped.`)
        if (result.skipped > 0) parts.push(`${result.skipped} rows had errors.`)
        setMessage(parts.join(' '))
        form.reset()
        await load()
      }
    } finally {
      setUploading(false)
    }
  }

  function openInboxAssignment(campaign: CampaignRow) {
    setAssigningCampaignId(campaign.id)
    setSelectedInboxIds(campaign.assignedInboxIds ?? [])
  }

  async function saveInboxAssignment() {
    if (assigningCampaignId === null) return
    setSavingInboxes(true)
    try {
      const res = await fetch('/api/campaigns/inboxes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: assigningCampaignId, inboxIds: selectedInboxIds }),
      })
      if (res.ok) {
        setMessage(`Inbox assignment saved.`)
        setAssigningCampaignId(null)
        await load()
      }
    } finally {
      setSavingInboxes(false)
    }
  }

  function toggleSelectedInbox(inboxId: string) {
    setSelectedInboxIds((prev) =>
      prev.includes(inboxId) ? prev.filter((id) => id !== inboxId) : [...prev, inboxId]
    )
  }

  async function importLocalFile(fileName: string) {
    setUploading(true)
    setMessage(null)
    const campaignName = fileName.replace(/\.(csv|xlsx|xlsm)$/i, '')

    try {
      const res = await fetch('/api/campaign-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, campaignName }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessage(`Import failed: ${data.error || res.statusText}`)
      } else {
        setMessage(`Imported ${data.imported} contacts from ${fileName}.`)
        await load()
      }
    } finally {
      setUploading(false)
    }
  }

  async function setCampaignActive(campaign: CampaignRow, active: boolean) {
    setToggling(campaign.id)
    setMessage(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id, active }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessage(`Update failed: ${data.error || res.statusText}`)
      } else {
        setMessage(active ? `Resumed "${campaign.name}".` : `Paused "${campaign.name}".`)
        await load()
      }
    } finally {
      setToggling(null)
    }
  }

  async function deleteCampaign(campaign: CampaignRow) {
    const confirmed = window.confirm(`Delete "${campaign.name}" and all ${campaign.totalContacts || 0} contacts in it? This also removes send history for this campaign.`)
    if (!confirmed) return

    setDeleting(campaign.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/campaigns?campaignId=${campaign.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessage(`Delete failed: ${data.error || res.statusText}`)
      } else {
        setMessage(`Deleted ${campaign.name}.`)
        await load()
      }
    } finally {
      setDeleting(null)
    }
  }

  async function deleteEverything() {
    const confirmed = window.confirm('Delete ALL campaigns, contacts, and send history? This cannot be undone.')
    if (!confirmed) return

    setDeleting('all')
    setMessage(null)
    try {
      const res = await fetch('/api/campaigns', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessage(`Delete failed: ${data.error || res.statusText}`)
      } else {
        setMessage('Deleted all campaigns, contacts, and send history.')
        await load()
      }
    } finally {
      setDeleting(null)
    }
  }

  function coverageLabel(campaign: CampaignRow) {
    const total = campaign.totalContacts || 0
    if (total === 0) return 'No contacts'

    return campaign.emailCoverage
      .map((row) => `E${row.step} ${row.complete}/${total}`)
      .join(' · ')
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="text-gray-400 text-sm mt-1">Upload CSV or XLSX files with pre-written sequence emails.</p>
        </div>
        <button
          onClick={deleteEverything}
          disabled={campaigns.length === 0 || deleting !== null || uploading}
          className="rounded-md bg-red-950 border border-red-800 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {deleting === 'all' ? 'Deleting...' : 'Clear All'}
        </button>
      </div>

      <CampaignSendControls />

      <form id="new-campaign" onSubmit={uploadCampaign} className="bg-gray-900 border border-gray-800 rounded-lg p-5 mb-6 scroll-mt-8">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label className="block">
            <span className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Campaign name</span>
            <input
              name="campaignName"
              required
              className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
              placeholder="May Apollo batch"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Lead file</span>
            <input
              name="file"
              type="file"
              required
              accept=".csv,.xlsx,.xlsm"
              className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-gray-300 file:mr-3 file:rounded file:border-0 file:bg-gray-800 file:px-3 file:py-1 file:text-gray-200"
            />
          </label>
          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {uploading ? 'Importing...' : 'Import'}
          </button>
        </div>
        {message && <p className="text-sm text-gray-300 mt-4">{message}</p>}
      </form>

      {localFiles.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg mb-6">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300">Files already in /campaigns</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {localFiles.map((fileName) => (
              <div key={fileName} className="px-5 py-3 flex items-center justify-between gap-4">
                <span className="font-mono text-xs text-indigo-300 truncate">{fileName}</span>
                <button
                  onClick={() => importLocalFile(fileName)}
                  disabled={uploading}
                  className="shrink-0 rounded-md bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600 disabled:opacity-50"
                >
                  Import
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
              <th className="text-left px-5 py-3">Campaign</th>
              <th className="text-left px-5 py-3">Contacts</th>
              <th className="text-left px-5 py-3">Sent</th>
              <th className="text-left px-5 py-3">Opens</th>
              <th className="text-left px-5 py-3">Replies</th>
              <th className="text-left px-5 py-3">Bounces</th>
              <th className="text-left px-5 py-3">Inboxes</th>
              <th className="text-left px-5 py-3">Sending</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td className="px-5 py-4 text-gray-500" colSpan={10}>Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td className="px-5 py-4 text-gray-500" colSpan={10}>No campaigns imported yet.</td></tr>
            ) : campaigns.map((campaign) => (
              <tr key={campaign.id} className="hover:bg-gray-800/40">
                <td className="px-5 py-3">
                  <div className="text-gray-100 font-medium">{campaign.name}</div>
                  <div className="text-gray-500 font-mono text-xs mt-0.5">{campaign.fileName || ''}</div>
                </td>
                <td className="px-5 py-3 text-gray-300">{campaign.totalContacts || 0}</td>
                <td className="px-5 py-3 text-gray-300">{campaign.sentEmails}</td>
                <td className="px-5 py-3">
                  <span className="text-blue-400 font-medium">{campaign.openCount}</span>
                  <span className="text-gray-500 text-xs ml-1">{campaign.openRate}%</span>
                </td>
                <td className="px-5 py-3">
                  <span className="text-emerald-400 font-medium">{campaign.replyCount}</span>
                  <span className="text-gray-500 text-xs ml-1">{campaign.replyRate}%</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`font-medium ${Number(campaign.bounceRate) >= 5 ? 'text-red-400' : Number(campaign.bounceRate) >= 2 ? 'text-amber-400' : 'text-gray-400'}`}>
                    {campaign.bounceCount}
                  </span>
                  <span className="text-gray-500 text-xs ml-1">{campaign.bounceRate}%</span>
                  {Number(campaign.bounceRate) >= 5 && <span className="ml-1 text-red-400 text-xs font-bold">⚠</span>}
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => openInboxAssignment(campaign)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline"
                  >
                    {(campaign.assignedInboxIds?.length ?? 0) > 0
                      ? `${campaign.assignedInboxIds.length} assigned`
                      : 'Any (all)'}
                  </button>
                </td>
                <td className="px-5 py-3">
                  {campaign.sendingLabel === 'Live' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-300 border border-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live
                    </span>
                  ) : campaign.sendingLabel === 'Paused' ? (
                    <span className="inline-flex items-center rounded-full bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-200 border border-amber-800">
                      Paused
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-400 border border-gray-700">
                      Complete
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right space-x-2 whitespace-nowrap">
                  <button
                    onClick={() => setPreview(campaign)}
                    disabled={!campaign.previewContact}
                    className="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setCampaignActive(campaign, campaign.active === false)}
                    disabled={toggling !== null || deleting !== null || uploading}
                    className="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {toggling === campaign.id ? 'Saving...' : campaign.active === false ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    onClick={() => deleteCampaign(campaign)}
                    disabled={deleting !== null || uploading || toggling !== null}
                    className="rounded-md bg-red-950 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {deleting === campaign.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inbox Assignment Modal */}
      {assigningCampaignId !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
          <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg">
            <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-white">Assign Inboxes</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Select which inboxes send for this campaign. Leave all unchecked to use all active inboxes.
                </p>
              </div>
              <button onClick={() => setAssigningCampaignId(null)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>
            <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
              {inboxOptions.length === 0 && (
                <p className="text-gray-500 text-sm">No inboxes configured.</p>
              )}
              {inboxOptions.map((inbox) => (
                <label key={inbox.id} className="flex items-center gap-3 p-2.5 rounded-md hover:bg-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedInboxIds.includes(inbox.id)}
                    onChange={() => toggleSelectedInbox(inbox.id)}
                    className="rounded border-gray-600 bg-gray-800 text-indigo-500"
                  />
                  <span className="font-mono text-sm text-indigo-300">{inbox.address}</span>
                  {!inbox.active && <span className="text-xs text-gray-500">(paused)</span>}
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-gray-800 px-5 py-4">
              <span className="text-xs text-gray-500">
                {selectedInboxIds.length === 0 ? 'All active inboxes will be used' : `${selectedInboxIds.length} inbox${selectedInboxIds.length !== 1 ? 'es' : ''} selected`}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setAssigningCampaignId(null)}
                  className="rounded-md bg-gray-700 px-4 py-1.5 text-sm text-gray-200 hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={saveInboxAssignment}
                  disabled={savingInboxes}
                  className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {savingInboxes ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {preview?.previewContact && (
        <div className="fixed inset-0 z-50 bg-black/70 p-6 overflow-auto">
          <div className="mx-auto max-w-4xl bg-gray-900 border border-gray-700 rounded-lg">
            <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{preview.name} Email Preview</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {preview.previewContact.firstName} {preview.previewContact.lastName} · {preview.previewContact.primaryEmail}
                  {preview.previewContact.companyName ? ` · ${preview.previewContact.companyName}` : ''}
                </p>
                <p className="text-xs text-gray-500 mt-2 max-w-xl">
                  Paragraphs and line breaks are styled automatically here. If AI polish is turned on for sends, wording may differ slightly from this preview.
                </p>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-5">
              {preview.previewContact.emails.map((email) => (
                <section key={email.step} className="border border-gray-800 rounded-lg overflow-hidden">
                  <div className="bg-gray-950 px-4 py-3 border-b border-gray-800">
                    <p className="text-xs uppercase tracking-wider text-gray-500">Email {email.step}</p>
                    <p className="text-sm font-medium text-gray-100 mt-1">{email.subject || 'Missing subject'}</p>
                  </div>
                  {email.body ? (
                    <iframe
                      sandbox=""
                      title={`Email ${email.step} preview`}
                      srcDoc={email.body}
                      className="w-full h-72 bg-white"
                    />
                  ) : (
                    <p className="px-4 py-6 text-sm text-gray-500">Missing body</p>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
