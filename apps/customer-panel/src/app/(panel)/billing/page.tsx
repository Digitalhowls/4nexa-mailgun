'use client';

import { useQuery } from '@tanstack/react-query';
import { CreditCard, Package, HardDrive, Mail, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { billingApi } from '@/lib/api/billing.api';
import { useAuthStore } from '@/store/auth.store';
import { getErrorMessage } from '@/lib/utils';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function UsageBar({ used, limit, overage }: { used: number; limit: number | null; overage: boolean }) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${overage ? 'bg-destructive' : pct > 80 ? 'bg-yellow-500' : 'bg-primary'}`}
          style={{ width: limit ? `${pct}%` : '0%' }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {limit ? `${pct.toFixed(0)}% utilizado` : 'Sin límite'}
      </p>
    </div>
  );
}

export default function BillingPage() {
  const user = useAuthStore((s) => s.user);
  const tenantId = user?.tenantId ?? '';

  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: ['billing-meter', tenantId],
    queryFn: () => billingApi.getMeterSnapshot(tenantId),
    enabled: Boolean(tenantId),
    refetchInterval: 60_000,
  });

  const statusVariant = (status: string) => {
    if (status === 'ACTIVE') return 'success';
    if (status === 'GRACE') return 'warning';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Facturación y uso</h2>
        <p className="text-muted-foreground">
          Uso actual del plan y estado de tu cuenta
        </p>
      </div>

      {/* Estado de billing */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="mt-2 h-2 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
          </CardContent>
        </Card>
      )}

      {snapshot && (
        <>
          {/* Estado general */}
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={statusVariant(snapshot.billingStatus)} className="text-sm px-3 py-1">
              Estado: {snapshot.billingStatus}
            </Badge>
            {snapshot.planId && (
              <Badge variant="outline" className="text-sm px-3 py-1">
                <Package className="mr-1.5 h-3.5 w-3.5" />
                Plan: {snapshot.planId}
              </Badge>
            )}
            {(snapshot.overages.mailboxes || snapshot.overages.domains || snapshot.overages.storage) && (
              <Badge variant="destructive" className="text-sm px-3 py-1">
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                Límites superados
              </Badge>
            )}
          </div>

          {/* Métricas de uso */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Buzones */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Buzones</CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {snapshot.mailboxCount}
                  {snapshot.planLimits.maxMailboxes && (
                    <span className="ml-1 text-base font-normal text-muted-foreground">
                      / {snapshot.planLimits.maxMailboxes}
                    </span>
                  )}
                </div>
                <UsageBar
                  used={snapshot.mailboxCount}
                  limit={snapshot.planLimits.maxMailboxes}
                  overage={snapshot.overages.mailboxes}
                />
              </CardContent>
            </Card>

            {/* Dominios */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Dominios</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {snapshot.domainCount}
                  {snapshot.planLimits.maxDomains && (
                    <span className="ml-1 text-base font-normal text-muted-foreground">
                      / {snapshot.planLimits.maxDomains}
                    </span>
                  )}
                </div>
                <UsageBar
                  used={snapshot.domainCount}
                  limit={snapshot.planLimits.maxDomains}
                  overage={snapshot.overages.domains}
                />
              </CardContent>
            </Card>

            {/* Almacenamiento */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Almacenamiento</CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatBytes(snapshot.usedStorageBytes)}
                  {snapshot.planLimits.storageTotalBytes && (
                    <span className="ml-1 text-base font-normal text-muted-foreground">
                      / {formatBytes(snapshot.planLimits.storageTotalBytes)}
                    </span>
                  )}
                </div>
                <UsageBar
                  used={snapshot.usedStorageBytes}
                  limit={snapshot.planLimits.storageTotalBytes}
                  overage={snapshot.overages.storage}
                />
              </CardContent>
            </Card>

            {/* Emails enviados hoy */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Enviados hoy</CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {snapshot.outboundTodayCount}
                  {snapshot.planLimits.outboundDailyLimit && (
                    <span className="ml-1 text-base font-normal text-muted-foreground">
                      / {snapshot.planLimits.outboundDailyLimit}
                    </span>
                  )}
                </div>
                <UsageBar
                  used={snapshot.outboundTodayCount}
                  limit={snapshot.planLimits.outboundDailyLimit}
                  overage={false}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!isLoading && !error && !snapshot && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No se pudo cargar el estado de facturación. Contacta con soporte.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
