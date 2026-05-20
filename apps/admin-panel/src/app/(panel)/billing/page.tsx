'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search, CreditCard, ArrowRightLeft, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { billingApi } from '@/lib/api/billing.api';
import { tenantsApi } from '@/lib/api/tenants.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, getStatusLabel } from '@/lib/utils';

const BILLING_STATUSES = [
  'ACTIVE',
  'GRACE',
  'SUSPENDED',
  'CANCELLED',
  'TRIAL',
  'PENDING_PAYMENT',
  'RESTRICTED',
] as const;

const transitionSchema = z.object({
  newStatus: z.string().min(1, 'Requerido'),
  reason: z.string().optional(),
});
type TransitionForm = z.infer<typeof transitionSchema>;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [searchTenant, setSearchTenant] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [transitionOpen, setTransitionOpen] = useState(false);

  const { data: tenantsData, isLoading: loadingTenants } = useQuery({
    queryKey: ['tenants-billing', 1, 50],
    queryFn: () => tenantsApi.findAll(1, 50),
  });

  const { data: snapshot, isLoading: loadingSnapshot } = useQuery({
    queryKey: ['billing-snapshot', selectedTenantId],
    queryFn: () => billingApi.getMeterSnapshot(selectedTenantId!),
    enabled: !!selectedTenantId,
  });

  const transitionForm = useForm<TransitionForm>({ resolver: zodResolver(transitionSchema) });

  const transitionMutation = useMutation({
    mutationFn: (vals: TransitionForm) =>
      billingApi.transitionStatus(selectedTenantId!, {
        newStatus: vals.newStatus,
        reason: vals.reason || undefined,
      }),
    onSuccess: (res) => {
      toast({
        title: 'Transición aplicada',
        description: `${res.previousStatus} → ${res.newStatus}`,
      });
      queryClient.invalidateQueries({ queryKey: ['billing-snapshot', selectedTenantId] });
      setTransitionOpen(false);
      transitionForm.reset();
    },
    onError: (err) =>
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const tenants = tenantsData?.items ?? [];
  const filtered = searchTenant
    ? tenants.filter(
        (t) =>
          t.name.toLowerCase().includes(searchTenant.toLowerCase()) ||
          t.slug.toLowerCase().includes(searchTenant.toLowerCase()),
      )
    : tenants;

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  function billingStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'ACTIVE' || status === 'TRIAL') return 'default';
    if (status === 'GRACE' || status === 'RESTRICTED') return 'secondary';
    if (status === 'SUSPENDED' || status === 'CANCELLED') return 'destructive';
    return 'outline';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing & Metering</h1>
        <p className="text-sm text-muted-foreground">
          Consumo en tiempo real y gestión del ciclo de facturación por tenant
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Seleccionar Tenant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tenant…"
                className="pl-8"
                value={searchTenant}
                onChange={(e) => setSearchTenant(e.target.value)}
              />
            </div>
            <div className="max-h-96 overflow-y-auto space-y-1">
              {loadingTenants
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))
                : filtered.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTenantId(t.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        t.id === selectedTenantId
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs opacity-70">{t.slug}</div>
                    </button>
                  ))}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {!selectedTenantId ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <CreditCard className="h-8 w-8" />
                <p>Selecciona un tenant para ver su consumo</p>
              </CardContent>
            </Card>
          ) : loadingSnapshot ? (
            <Card>
              <CardContent className="space-y-4 p-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : snapshot ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{selectedTenant?.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    Plan ID: {snapshot.planId ?? 'Sin plan'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={billingStatusVariant(snapshot.billingStatus)}>
                    {getStatusLabel(snapshot.billingStatus)}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTransitionOpen(true)}
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Transición
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <MeterCard
                  label="Buzones activos"
                  value={snapshot.mailboxCount}
                  limit={snapshot.planLimits.maxMailboxes}
                  overage={snapshot.overages.mailboxes}
                />
                <MeterCard
                  label="Dominios activos"
                  value={snapshot.domainCount}
                  limit={snapshot.planLimits.maxDomains}
                  overage={snapshot.overages.domains}
                />
                <MeterCard
                  label="Emails enviados hoy"
                  value={snapshot.outboundTodayCount}
                  limit={snapshot.planLimits.outboundDailyLimit}
                />
              </div>

              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Almacenamiento usado</span>
                    <span className={`font-medium ${snapshot.overages.storage ? 'text-destructive' : ''}`}>
                      {formatBytes(snapshot.usedStorageBytes)}
                      {snapshot.planLimits.storageTotalBytes !== null && (
                        <span className="text-muted-foreground font-normal">
                          {' '}/ {formatBytes(snapshot.planLimits.storageTotalBytes)}
                        </span>
                      )}
                    </span>
                  </div>
                  {snapshot.overages.storage && (
                    <div className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      Límite de almacenamiento superado
                    </div>
                  )}
                  {(snapshot.overages.mailboxes || snapshot.overages.domains) && (
                    <div className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      Overages detectados — revisa el plan
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>

      <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transición de estado de billing</DialogTitle>
            <DialogDescription>
              Tenant: <strong>{selectedTenant?.name}</strong> · Estado actual:{' '}
              <strong>{snapshot ? getStatusLabel(snapshot.billingStatus) : '…'}</strong>
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={transitionForm.handleSubmit((v) => transitionMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>Nuevo estado</Label>
              <Select
                onValueChange={(v) => transitionForm.setValue('newStatus', v)}
                defaultValue=""
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {getStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {transitionForm.formState.errors.newStatus && (
                <p className="text-xs text-destructive">
                  {transitionForm.formState.errors.newStatus.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Motivo (opcional)</Label>
              <Input placeholder="Impago confirmado, plan cambiado…" {...transitionForm.register('reason')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTransitionOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={transitionMutation.isPending}>
                {transitionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aplicar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MeterCard({
  label,
  value,
  limit,
  overage,
}: {
  label: string;
  value: number;
  limit?: number | null;
  overage?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${overage ? 'text-destructive' : ''}`}>
          {value.toLocaleString('es-ES')}
        </p>
        {limit !== null && limit !== undefined && (
          <p className="text-xs text-muted-foreground">
            límite: {limit.toLocaleString('es-ES')}
          </p>
        )}
        {overage && (
          <div className="flex items-center gap-1 text-xs text-destructive mt-1">
            <AlertTriangle className="h-3 w-3" />
            Overage
          </div>
        )}
      </CardContent>
    </Card>
  );
}
