'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  HardHat,
  FileText,
  ClipboardList,
  Receipt,
  Clock,
  Award,
  Users,
  Contact,
  Package,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import { FeedbackButton } from './feedback-button';

// Sidebar lists ONLY routes that have a corresponding page.tsx in this
// app. The check-routes script (npm run check:routes) enforces this at
// build time — any href here without a backing page fails CI. Add a new
// nav item ONLY when the page exists; restore items as their pages
// land. See PIR 2026-04-27-bossboard-dashboard-404s.
const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'SWMS', href: '/swms', icon: HardHat },
  { label: 'Invoices', href: '/invoices', icon: FileText },
  { label: 'Quotes', href: '/quotes', icon: ClipboardList },
  { label: 'Clients', href: '/customers', icon: Contact },
  { label: 'Products', href: '/products', icon: Package },
  { label: 'Expenses', href: '/expenses', icon: Receipt },
  { label: 'Job logs', href: '/job-logs', icon: Clock },
  { label: 'Certifications', href: '/certifications', icon: Award },
  { label: 'Team', href: '/teams', icon: Users },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const navContent = (
    <nav className="flex flex-col gap-1 px-3 py-4 h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 py-4 mb-2">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <span className="text-white font-bold text-sm">BB</span>
        </div>
        <span className="text-lg font-bold text-white">BossBoard</span>
      </div>

      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive(item.href)
              ? 'bg-accent text-white font-semibold'
              : 'text-gray-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <item.icon size={18} />
          {item.label}
        </Link>
      ))}

      <div className="mt-auto pt-4 border-t border-white/10">
        <FeedbackButton />
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-primary text-white shadow-lg"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-primary z-40 transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navContent}
      </aside>
    </>
  );
}
