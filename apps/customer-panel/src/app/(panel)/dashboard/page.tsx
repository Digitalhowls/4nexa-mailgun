'use client';

import { useQuery } from '@tanstack/react-query';
import { Globe, Inbox, ArrowLeftRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { domainsApi } from '@/lib/api/domains.api';
import { mailboxesApi } from '@/lib/api/mailboxes.api';
import { aliasesApi } from '@/lib/api/aliases.api';
import { useAuthStore } from '@/store/auth.store';
import { formatDate } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: number | undefined;
  icon: React.ElementType;
  loading: boolean;
}

function StatCard({ title, value, icon: Icon, loading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-3xl font-bold">{value ?? 0}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const { data: domains, isLoading: loadingDomains } = useQuery({
    queryKey: ['domains', 1, 1],
    queryFn: () => domainsApi.findAll(1, 1),
  });

  const { data: mailboxes, isLoading: loadingMailboxes } = useQuery({
    queryKey: ['mailboxes', 1, 1],
    queryFn: () => mailboxesApi.findAll(1, 1),
  });

  const { data: aliases, isLoading: loadingAliases } = useQuery({
    queryKey: ['aliases', 1, 1],
    queryFn: () => aliasesApi.findAll(1, 1),
  });

  const { data: recentDomains, isLoading: loadingRecent } = useQuery({
    queryKey: ['domains', 'recent'],
    queryFn: () => domainsApi.findAll(1, 5),
  });

  return (
    <div className="space-y-6">
      {/* Bienvenida */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Bienvenido{user?.email ? `, ${user.email.split('@')[0]}` : ''}
        </h2>
        <p className="text-muted-foreground">Resumen de tu servicio de correo</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Dominios"
          value={domains?.total}
          icon={Globe}
          loading={loadingDomains}
        />
        <StatCard
          title="Buzones"
          value={mailboxes?.total}
          icon={Inbox}
          loading={loadingMailboxes}
        />
        <StatCard
          title="Alias"
          value={aliases?.total}
          icon={ArrowLeftRight}
          loading={loadingAliases}
        />
      </div>

      {/* Dominios recientes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dominios recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRecent ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : recentDomains?.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no tienes dominios registrados.</p>
          ) : (
            <ul className="divide-y">
              {recentDomains?.items.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-sm">{d.domain}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={d.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {d.status === 'ACTIVE' ? 'Activo' : d.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(d.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
