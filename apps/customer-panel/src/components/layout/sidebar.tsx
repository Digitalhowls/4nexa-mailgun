'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Globe,
  Inbox,
  ArrowLeftRight,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/domains', label: 'Dominios', icon: Globe },
  { href: '/mailboxes', label: 'Buzones', icon: Inbox },
  { href: '/aliases', label: 'Alias', icon: ArrowLeftRight },
  { href: '/profile', label: 'Mi cuenta', icon: User },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-64 flex-col border-r bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <span className="text-lg font-bold text-foreground">4nexa Mail</span>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-6 py-4">
        <p className="text-xs text-muted-foreground">Panel de cliente</p>
      </div>
    </aside>
  );
}
