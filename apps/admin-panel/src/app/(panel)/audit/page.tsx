'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck, ShieldAlert, Search, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { auditApi, type AuditQueryParams } from '@/lib/api/audit.api';
import { toast } from '@/components/ui/use-toast';
import { formatDate, getErrorMessage } from '@/lib/utils';

const verifyRangeSchema = z.object({
  startDate: z.string().min(1, 'Requerido'),
  endDate: z.string().min(1, 'Requerido'),
});
type VerifyRangeForm = z.infer<typeof verifyRangeSchema>;

const filterSchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  tenantId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
type FilterForm = z.infer<typeof filterSchema>;

export default function AuditPage() {
  const [params, setParams] = useState<AuditQueryParams>({ limit: 50, offset: 0 });
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [detailLog, setDetailLog] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => auditApi.list(params),
  });

  const { data: logDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['audit-log-detail', detailLog],
    queryFn: () => auditApi.findById(detailLog!),
    enabled: !!detailLog,
  });

  const filterForm = useForm<FilterForm>({ resolver: zodResolver(filterSchema) });
  const rangeForm = useForm<VerifyRangeForm>({ resolver: zodResolver(verifyRangeSchema) });

  const verifyRange = useMutation({
    mutationFn: (vals: VerifyRangeForm) => auditApi.verifyRange(vals.startDate, vals.endDate),
    onSuccess: (res) => {
      toast({
        title: res.failed === 0 ? 'Integridad verificada' : 'Fallos de integridad detectados',
        description: `${res.verified} OK · ${res.failed} fallos · ${res.legacy} legacy`,
        variant: res.failed > 0 ? 'destructive' : 'default',
      });
      setVerifyDialogOpen(false);
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  function applyFilters(vals: FilterForm) {
    setParams({
      ...params,
      action: vals.action || undefined,
      entityType: vals.entityType || undefined,
      tenantId: vals.tenantId || undefined,
      startDate: vals.startDate ? new Date(vals.startDate).toISOString() : undefined,
      endDate: vals.endDate ? new Date(vals.endDate).toISOString() : undefined,
      offset: 0,
    });
  }

  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 50;

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Auditoría</h1>
          <p className="text-sm text-muted-foreground">
            Registro inmutable de acciones · verificación HMAC SHA-256
          </p>
        </div>
        <Button variant="outline" onClick={() => setVerifyDialogOpen(true)}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Verificar rango
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={filterForm.handleSubmit(applyFilters)}
            className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5"
          >
            <div className="space-y-1">
              <Label>Acción</Label>
              <Input placeholder="domain.created…" {...filterForm.register('action')} />
            </div>
            <div className="space-y-1">
              <Label>Tipo entidad</Label>
              <Input placeholder="domain, tenant…" {...filterForm.register('entityType')} />
            </div>
            <div className="space-y-1">
              <Label>Tenant ID</Label>
              <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="font-mono text-sm" {...filterForm.register('tenantId')} />
            </div>
            <div className="space-y-1">
              <Label>Desde</Label>
              <Input type="datetime-local" {...filterForm.register('startDate')} />
            </div>
            <div className="space-y-1">
              <Label>Hasta</Label>
              <Input type="datetime-local" {...filterForm.register('endDate')} />
            </div>
            <div className="flex items-end gap-2 col-span-2 md:col-span-3 lg:col-span-5">
              <Button type="submit" size="sm">
                <Search className="mr-2 h-3.5 w-3.5" /> Buscar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  filterForm.reset();
                  setParams({ limit: 50, offset: 0 });
                }}
              >
                Limpiar
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {total.toLocaleString('es-ES')} registros
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Tipo entidad</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : items.map((log) => (
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono text-xs">{formatDate(log.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.entityType}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.entityId ? log.entityId.slice(0, 8) + '…' : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.userId ? log.userId.slice(0, 8) + '…' : '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailLog(log.id)}
                        >
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginación */}
      {total > limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {offset + 1}–{Math.min(offset + limit, total)} de {total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setParams((p) => ({ ...p, offset: Math.max(0, (p.offset ?? 0) - limit) }))}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + limit >= total}
              onClick={() => setParams((p) => ({ ...p, offset: (p.offset ?? 0) + limit }))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Dialog detalle de log */}
      <Dialog open={!!detailLog} onOpenChange={(open) => !open && setDetailLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del registro de auditoría</DialogTitle>
            <DialogDescription>ID: {detailLog}</DialogDescription>
          </DialogHeader>
          {loadingDetail ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : logDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Acción</span>
                  <p className="font-mono font-semibold">{logDetail.action}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tipo entidad</span>
                  <p>{logDetail.entityType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Entidad ID</span>
                  <p className="font-mono text-xs">{logDetail.entityId ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tenant ID</span>
                  <p className="font-mono text-xs">{logDetail.tenantId ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Usuario ID</span>
                  <p className="font-mono text-xs">{logDetail.userId ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha</span>
                  <p>{formatDate(logDetail.createdAt)}</p>
                </div>
              </div>
              {logDetail.metadata && Object.keys(logDetail.metadata).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Metadata</p>
                  <pre className="rounded bg-muted p-3 text-xs overflow-auto max-h-40">
                    {JSON.stringify(logDetail.metadata, null, 2)}
                  </pre>
                </div>
              )}
              <IntegrityBadge id={logDetail.id} />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailLog(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog verificar rango */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verificar integridad HMAC por rango</DialogTitle>
            <DialogDescription>
              Comprueba que ningún registro fue alterado en el rango indicado.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={rangeForm.handleSubmit((v) => verifyRange.mutate(v))} className="space-y-4">
            <div className="space-y-1">
              <Label>Desde</Label>
              <Input type="datetime-local" {...rangeForm.register('startDate')} />
              {rangeForm.formState.errors.startDate && (
                <p className="text-xs text-destructive">{rangeForm.formState.errors.startDate.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Hasta</Label>
              <Input type="datetime-local" {...rangeForm.register('endDate')} />
              {rangeForm.formState.errors.endDate && (
                <p className="text-xs text-destructive">{rangeForm.formState.errors.endDate.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVerifyDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={verifyRange.isPending}>
                {verifyRange.isPending ? (
                  <>Verificando…</>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Verificar
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IntegrityBadge({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-verify', id],
    queryFn: () => auditApi.verifyIntegrity(id),
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-6 w-32" />;
  if (!data) return null;

  if (data.legacy) {
    return (
      <div className="flex items-center gap-2 rounded border px-3 py-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        Registro legacy (sin HMAC)
      </div>
    );
  }

  return data.verified ? (
    <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
      <CheckCircle2 className="h-4 w-4" />
      Integridad HMAC verificada
    </div>
  ) : (
    <div className="flex items-center gap-2 rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <XCircle className="h-4 w-4" />
      FALLO DE INTEGRIDAD — registro posiblemente alterado
    </div>
  );
}
