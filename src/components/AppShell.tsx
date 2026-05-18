'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from './LogoutButton'

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/replies', label: 'Replies' },
  { href: '/inboxes', label: 'Inboxes' },
  { href: '/settings', label: 'Settings' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/login' || pathname === '/signup') {
    return <main className="flex-1 overflow-auto">{children}</main>
  }

  return (
    <>
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
        <div className="px-3 py-3 border-t border-gray-800">
          <LogoutButton />
          <p className="px-3 pt-2 text-xs text-gray-600">v0.1.0</p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </>
  )
}
