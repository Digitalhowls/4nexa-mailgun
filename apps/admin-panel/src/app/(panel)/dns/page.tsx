'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Network, Plus, Trash2, Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { dnsOrchestrationApi, type CreateDnsProviderPayload, type DnsProviderType, type DnsStatus } from '@/lib/api/dns-orchestration.api';
import { domainsApi } from '@/lib/api/domains.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, formatDate } from '@/lib/utils';

const PROVIDER_TYPES: { value: DnsProviderType; label: string }[] = [
  { value: 'CLOUDFLARE', label: 'Cloudflare' },
  { value: 'HETZNER', label: 'Hetzner DNS' },
  { value: 'OVH', label: 'OVH / OVHcloud' },
  { value: 'ROUTE53', label: 'AWS Route 53' },
  { value: 'POWERDNS', label: 'PowerDNS' },
  { value: 'MANUAL', label: 'Manual (sin API)' },
];

const schema = z.object({
  provider: z.enum(['CLOUDFLARE', 'HETZNER', 'OVH', 'ROUTE53', 'POWERDNS', 'MANUAL'] as const),
  apiKey: z.string().min(1, 'API key requerida'),
  apiSecret: z.string().optional(),
  zoneId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function DnsCheck({ valid }: { valid: boolean }) {
  return valid
    ? <CheckCircle className="h-4 w-4 text-green-600" />
    : <XCircle className="h-4 w-4 text-red-500" />;
}

export default function DnsPage() {
  const queryClient = useQueryClient();
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [selectedDomainId, setSelectedDomainId] = useState<string>('');
  const [dnsStatusData, setDnsStatusData] = useState<DnsStatus | null>(null);

  const { data: providers, isLoading: loadingProviders } = useQuery({
    queryKey: ['dns-providers'],
    queryFn: () => dnsOrchestrationApi.listProviders(),
  });

  const { data: domainsData } = useQuery({
    queryKey: ['domains', 'all'],
    queryFn: () => domainsApi.findAll(1, 200),
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { provider: 'CLOUDFLARE', apiKey: '' },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateDnsProviderPayload) => dnsOrchestrationApi.createProvider(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-providers'] });
      toast({ title: 'Proveedor DNS añadido', variant: 'success' });
      setProviderDialogOpen(false);
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => dnsOrchestrationApi.removeProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-providers'] });
      toast({ title: 'Proveedor eliminado' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const provisionMutation = useMutation({
    mutationFn: (domainId: string) => dnsOrchestrationApi.provisionDomain(domainId),
    onSuccess: (result) => {
      toast({ title: `Provisión completada: ${result.records.length} registros`, variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error en provisión', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: (domainId: string) => dnsOrchestrationApi.getDomainStatus(domainId),
    onSuccess: (data) => setDnsStatusData(data),
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Orquestación DNS</h2>
        <p className="text-muted-foreground">Gestiona proveedores DNS y provisiona registros automáticamente</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Proveedores DNS */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Proveedores DNS
                </CardTitle>
                <CardDescription>APIs de DNS para provisión automática de registros MX, SPF, DKIM, DMARC.</CardDescription>
              </div>
              <Button onClick={() => { reset(); setProviderDialogOpen(true); }} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Añadir proveedor
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Zone ID</TableHead>
                  <TableHead>Añadido</TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingProviders &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))}
                {!loadingProviders && (!providers || providers.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No hay proveedores DNS configurados.
                    </TableCell>
                  </TableRow>
                )}
                {!loadingProviders && providers?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge variant="secondary">{p.provider}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.zoneId ?? '—'}</TableCell>
                    <TableCell className="text-sm">{formatDate(p.createdAt)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeMutation.mutate(p.id)}
                        disabled={removeMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Provisión de dominio */}
        <Card>
          <CardHeader>
            <CardTitle>Provisión automática</CardTitle>
            <CardDescription>
              Crea automáticamente los registros DNS requeridos para un dominio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Dominio</Label>
              <Select value={selectedDomainId} onValueChange={setSelectedDomainId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un dominio…" />
                </SelectTrigger>
                <SelectContent>
                  {domainsData?.items.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!selectedDomainId || provisionMutation.isPending}
                onClick={() => provisionMutation.mutate(selectedDomainId)}
              >
                {provisionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Provisionar
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={!selectedDomainId || statusMutation.isPending}
                onClick={() => statusMutation.mutate(selectedDomainId)}
              >
                {statusMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Ver estado
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Estado DNS */}
        {dnsStatusData && (
          <Card>
            <CardHeader>
              <CardTitle>Estado DNS del dominio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {['mx', 'spf', 'dkim', 'dmarc'].map((rec) => (
                  <div key={rec} className="flex items-center gap-2">
                    <DnsCheck valid={Boolean((dnsStatusData as unknown as Record<string, unknown>)[rec])} />
                    <span className="text-sm font-medium uppercase">{rec}</span>
                  </div>
                ))}
              </div>
              {dnsStatusData.lastChecked && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Última comprobación: {formatDate(dnsStatusData.lastChecked as string)}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog añadir proveedor */}
      <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir proveedor DNS</DialogTitle>
            <DialogDescription>Conecta tu proveedor DNS para habilitar la provisión automática.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
            <div className="space-y-2">
              <Label>Proveedor *</Label>
              <Controller
                control={control}
                name="provider"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDER_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>API Key *</Label>
              <Input {...register('apiKey')} type="password" placeholder="••••••••••••••••" />
              {errors.apiKey && <p className="text-xs text-destructive">{errors.apiKey.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>API Secret <span className="text-muted-foreground text-xs">(si aplica)</span></Label>
              <Input {...register('apiSecret')} type="password" placeholder="••••••••••••••••" />
            </div>
            <div className="space-y-2">
              <Label>Zone ID <span className="text-muted-foreground text-xs">(si aplica)</span></Label>
              <Input {...register('zoneId')} placeholder="abc123def456" className="font-mono" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProviderDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Añadir
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
