'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Server,
  Building2,
  Globe,
  MailOpen,
  ArrowLeftRight,
  Settings,
  ClipboardList,
  CreditCard,
  Shield,
  KeyRound,
  Siren,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/plans', label: 'Planes', icon: Package },
  { href: '/nodes', label: 'Nodos', icon: Server },
  { href: '/tenants', label: 'Tenants', icon: Building2 },
  { href: '/domains', label: 'Dominios', icon: Globe },
  { href: '/mailboxes', label: 'Buzones', icon: MailOpen },
  { href: '/aliases', label: 'Alias', icon: ArrowLeftRight },
  { href: '/deliverability', label: 'Deliverability', icon: TrendingUp },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/antispam', label: 'Antispam', icon: Shield },
  { href: '/credentials', label: 'Credenciales', icon: KeyRound },
  { href: '/audit', label: 'Auditoría', icon: ClipboardList },
  { href: '/disaster-recovery', label: 'Disaster Recovery', icon: Siren },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-xl font-bold text-sidebar-primary">4nexa</span>
        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
          Admin
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-sidebar-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
          Configuración
        </Link>
      </div>
    </aside>
  );
}
