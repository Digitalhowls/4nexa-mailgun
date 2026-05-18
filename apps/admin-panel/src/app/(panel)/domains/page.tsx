'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { domainsApi, type Domain, type DnsStatus } from '@/lib/api/domains.api';
import { tenantsApi } from '@/lib/api/tenants.api';
import { nodesApi } from '@/lib/api/nodes.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, getStatusLabel, formatDate } from '@/lib/utils';

const domainSchema = z.object({
  domain: z.string().min(3, 'Dominio inválido').regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/, 'Formato de dominio inválido'),
  tenantId: z.string().uuid('Selecciona un tenant'),
  nodeId: z.string().uuid().optional().or(z.literal('')),
});

type DomainForm = z.infer<typeof domainSchema>;

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success',
  PENDING_DNS: 'warning',
  SUSPENDED: 'destructive',
  DELETED: 'secondary',
};

function DnsCheckIcon({ valid }: { valid: boolean }) {
  return valid
    ? <CheckCircle className="h-4 w-4 text-green-600" />
    : <XCircle className="h-4 w-4 text-red-500" />;
}

export default function DomainsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dnsDialogOpen, setDnsDialogOpen] = useState(false);
  const [deletingDomain, setDeletingDomain] = useState<Domain | null>(null);
  const [dnsStatus, setDnsStatus] = useState<DnsStatus | null>(null);
  const [checkingDomain, setCheckingDomain] = useState<Domain | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['domains', page],
    queryFn: () => domainsApi.findAll(page, 20),
  });

  const { data: tenantsData } = useQuery({
    queryKey: ['tenants', 'all'],
    queryFn: () => tenantsApi.findAll(1, 200),
  });

  const { data: nodesData } = useQuery({
    queryKey: ['nodes', 'all'],
    queryFn: () => nodesApi.findAll(1, 100),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<DomainForm>({
    resolver: zodResolver(domainSchema),
    defaultValues: { domain: '', tenantId: '', nodeId: '' },
  });

  const createMutation = useMutation({
    mutationFn: (payload: { domain: string; tenantId: string; nodeId?: string }) =>
      domainsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast({ title: 'Dominio creado', variant: 'success' });
      setDialogOpen(false);
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => domainsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast({ title: 'Dominio eliminado' });
      setDeleteDialogOpen(false);
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => domainsApi.verifyDns(id),
    onSuccess: (result) => {
      setDnsStatus(result);
      queryClient.invalidateQueries({ queryKey: ['domains'] });
    },
    onError: (err) => toast({ title: 'Error al verificar DNS', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const onSubmit = (values: DomainForm) => {
    createMutation.mutate({
      domain: values.domain,
      tenantId: values.tenantId,
      nodeId: values.nodeId || undefined,
    });
  };

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dominios</h2>
          <p className="text-muted-foreground">
            Dominios de correo gestionados ({data?.total ?? 0} en total)
          </p>
        </div>
        <Button onClick={() => { reset(); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo dominio
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dominio</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Nodo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No hay dominios registrados.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              data?.items.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell className="font-mono font-medium">{domain.domain}</TableCell>
                  <TableCell>{domain.tenantId.slice(0, 8)}…</TableCell>
                  <TableCell>{domain.nodeId ? domain.nodeId.slice(0, 8) + '…' : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[domain.status] ?? 'secondary'}>
                      {getStatusLabel(domain.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(domain.createdAt)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <span className="text-lg leading-none">⋯</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setCheckingDomain(domain);
                            setDnsStatus(null);
                            setDnsDialogOpen(true);
                          }}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Verificar DNS
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setDeletingDomain(domain);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <span className="flex items-center px-3 text-sm">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
        </div>
      )}

      {/* Dialog crear dominio */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo dominio</DialogTitle>
            <DialogDescription>
              Registra un nuevo dominio de correo en la plataforma.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Dominio</Label>
              <Input {...register('domain')} placeholder="correo.ejemplo.com" />
              {errors.domain && <p className="text-xs text-destructive">{errors.domain.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Tenant</Label>
              <Select onValueChange={(v) => setValue('tenantId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenantsData?.items.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.slug})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.tenantId && <p className="text-xs text-destructive">{errors.tenantId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Nodo (opcional)</Label>
              <Select onValueChange={(v) => setValue('nodeId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Usar nodo del tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nodo del tenant</SelectItem>
                  {nodesData?.items.map((n) => (
                    <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear dominio
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog verificar DNS */}
      <Dialog open={dnsDialogOpen} onOpenChange={setDnsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verificación DNS — {checkingDomain?.domain}</DialogTitle>
            <DialogDescription>
              Comprueba que los registros DNS del dominio están correctamente configurados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!dnsStatus && (
              <Button
                onClick={() => checkingDomain && verifyMutation.mutate(checkingDomain.id)}
                disabled={verifyMutation.isPending}
                className="w-full"
              >
                {verifyMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Lanzar verificación
              </Button>
            )}
            {dnsStatus && (
              <div className="space-y-3">
                {(
                  [
                    { label: 'MX', key: 'mx' },
                    { label: 'SPF', key: 'spf' },
                    { label: 'DKIM', key: 'dkim' },
                    { label: 'DMARC', key: 'dmarc' },
                  ] as const
                ).map(({ label, key }) => (
                  <div key={key} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <DnsCheckIcon valid={dnsStatus[key].valid} />
                      <span className="font-medium text-sm">{label}</span>
                    </div>
                    <span className={`text-xs ${dnsStatus[key].valid ? 'text-green-600' : 'text-red-500'}`}>
                      {dnsStatus[key].valid ? 'Válido' : 'Inválido o ausente'}
                    </span>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full" onClick={() => setDnsStatus(null)}>
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Volver a verificar
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDnsDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar dominio?</DialogTitle>
            <DialogDescription>
              Se marcará como eliminado el dominio{' '}
              <strong>{deletingDomain?.domain}</strong>. Los buzones y alias asociados quedarán inactivos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingDomain && deleteMutation.mutate(deletingDomain.id)}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
