'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import {
  LayoutDashboard,
  HardHat,
  FileText,
  ClipboardList,
  Receipt,
  Clock,
  Award,
  Users,
  Settings,
  LogOut,
  User,
  Menu,
  X,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'SWMS', href: '/swms', icon: HardHat },
  { label: 'Invoices', href: '/invoices', icon: FileText },
  { label: 'Quotes', href: '/quotes', icon: ClipboardList },
  { label: 'Expenses', href: '/expenses', icon: Receipt },
  { label: 'Job logs', href: '/job-logs', icon: Clock },
  { label: 'Certifications', href: '/certifications', icon: Award },
  { label: 'Team', href: '/teams', icon: Users },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <header className="relative h-16 bg-surface border-b border-border-light flex items-center justify-between px-6 z-30">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-expanded={isOpen}
          aria-controls="mobile-nav"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User size={16} />
            <span>{user.name || user.email}</span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-danger transition-colors"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>

      {/* Mobile Navigation Overlay */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 z-40 md:hidden" 
            onClick={() => setIsOpen(false)}
          />
          <nav
            id="mobile-nav"
            className="absolute top-16 left-0 right-0 bg-surface border-b border-border-light shadow-xl z-50 md:hidden overflow-y-auto max-h-[calc(100vh-4rem)]"
          >
            <div className="flex flex-col p-4 gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <item.icon size={20} className={isActive(item.href) ? 'text-accent' : 'text-gray-400'} />
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
