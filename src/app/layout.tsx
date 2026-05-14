import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Email Sender — ai-automatedhq',
  description: 'Campaign management & sending dashboard',
}

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/replies', label: 'Replies' },
  { href: '/inboxes', label: 'Inboxes' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex bg-gray-950 text-gray-100">
        <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-800">
            <span className="text-sm font-semibold text-indigo-400 tracking-wide">
              AI-Automated HQ
            </span>
            <p className="text-xs text-gray-500 mt-0.5">Email Sender</p>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-600">
            v0.1.0
          </div>
        </aside>
        <main className="flex-1 overflow-auto">{children}</main>
      </body>
    </html>
  )
}
