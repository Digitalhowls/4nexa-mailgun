'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, Lock, Trash2, Plus, Loader2, Download, UserX, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { archivalApi, type ArchivalStorageType, type GdprExportResult, type GdprForgetResult } from '@/lib/api/archival.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, formatDate } from '@/lib/utils';

const policySchema = z.object({
  retentionYears: z.number().int().min(1).max(10),
  storageBackend: z.enum(['S3', 'LOCAL', 'AZURE_BLOB']),
  autoDeleteAfter: z.boolean(),
  encryptArchive: z.boolean(),
});

const legalHoldSchema = z.object({
  mailboxId: z.string().uuid('UUID de buzón inválido'),
  reason: z.string().min(10, 'Describe el motivo (mínimo 10 caracteres)').max(1000),
});

const gdprSchema = z.object({
  mailboxId: z.string().uuid('UUID de buzón inválido'),
});

type PolicyForm = z.infer<typeof policySchema>;
type LegalHoldForm = z.infer<typeof legalHoldSchema>;
type GdprForm = z.infer<typeof gdprSchema>;

export default function ArchivalPage() {
  const queryClient = useQueryClient();
  const [legalHoldDialogOpen, setLegalHoldDialogOpen] = useState(false);
  const [gdprDialogOpen, setGdprDialogOpen] = useState(false);
  const [gdprAction, setGdprAction] = useState<'export' | 'forget'>('export');

  const { data: policy, isLoading: loadingPolicy } = useQuery({
    queryKey: ['archival-policy'],
    queryFn: () => archivalApi.getPolicy(),
  });

  const { data: legalHolds, isLoading: loadingHolds } = useQuery({
    queryKey: ['legal-holds'],
    queryFn: () => archivalApi.listLegalHolds(),
  });

  const policyForm = useForm<PolicyForm>({
    resolver: zodResolver(policySchema),
    values: policy
      ? {
          retentionYears: policy.retentionYears,
          storageBackend: policy.storageBackend as ArchivalStorageType,
          autoDeleteAfter: policy.autoDeleteAfter,
          encryptArchive: policy.encryptArchive,
        }
      : { retentionYears: 7, storageBackend: 'LOCAL', autoDeleteAfter: false, encryptArchive: true },
  });

  const legalHoldForm = useForm<LegalHoldForm>({ resolver: zodResolver(legalHoldSchema) });
  const gdprForm = useForm<GdprForm>({ resolver: zodResolver(gdprSchema) });

  const savePolicyMutation = useMutation({
    mutationFn: (values: PolicyForm) =>
      archivalApi.setPolicy({
        retentionYears: values.retentionYears,
        storageBackend: values.storageBackend,
        autoDeleteAfter: values.autoDeleteAfter,
        encryptArchive: values.encryptArchive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archival-policy'] });
      toast({ title: 'Política de archivado guardada', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const createHoldMutation = useMutation({
    mutationFn: ({ mailboxId, reason }: LegalHoldForm) =>
      archivalApi.createLegalHold(mailboxId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-holds'] });
      toast({ title: 'Retención legal creada', variant: 'success' });
      setLegalHoldDialogOpen(false);
      legalHoldForm.reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteHoldMutation = useMutation({
    mutationFn: (id: string) => archivalApi.deleteLegalHold(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-holds'] });
      toast({ title: 'Retención eliminada', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const gdprMutation = useMutation<GdprExportResult | GdprForgetResult, Error, GdprForm>({
    mutationFn: ({ mailboxId }: GdprForm) =>
      gdprAction === 'export'
        ? archivalApi.exportGdpr(mailboxId)
        : archivalApi.forgetGdpr(mailboxId),
    onSuccess: () => {
      toast({
        title: gdprAction === 'export' ? 'Exportación iniciada' : 'Datos eliminados',
        variant: 'success',
      });
      setGdprDialogOpen(false);
      gdprForm.reset();
    },
    onError: (err) => toast({ title: 'Error RGPD', description: getErrorMessage(err), variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Archivado y cumplimiento</h2>
        <p className="text-muted-foreground">
          Política de retención, retenciones legales y derechos RGPD
        </p>
      </div>

      {/* Política de retención */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Política de archivado
          </CardTitle>
          <CardDescription>
            Define cuánto tiempo se conservan los mensajes y cómo se almacenan
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPolicy ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <form
              onSubmit={policyForm.handleSubmit((v) => savePolicyMutation.mutate(v))}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Años de retención</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    {...policyForm.register('retentionYears', { valueAsNumber: true })}
                  />
                  {policyForm.formState.errors.retentionYears && (
                    <p className="text-xs text-destructive">
                      {policyForm.formState.errors.retentionYears.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Backend de almacenamiento</Label>
                  <Select
                    value={policyForm.watch('storageBackend')}
                    onValueChange={(v) => policyForm.setValue('storageBackend', v as ArchivalStorageType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOCAL">Local</SelectItem>
                      <SelectItem value="S3">Amazon S3</SelectItem>
                      <SelectItem value="AZURE_BLOB">Azure Blob</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoDelete"
                    {...policyForm.register('autoDeleteAfter')}
                    className="h-4 w-4 rounded border"
                  />
                  <Label htmlFor="autoDelete">Eliminar tras período de retención</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="encrypt"
                    {...policyForm.register('encryptArchive')}
                    className="h-4 w-4 rounded border"
                  />
                  <Label htmlFor="encrypt">Cifrar archivado</Label>
                </div>
              </div>

              <Button type="submit" disabled={savePolicyMutation.isPending}>
                {savePolicyMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Guardar política
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Retenciones legales */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Retenciones legales
              </CardTitle>
              <CardDescription>
                Bloquea la eliminación de mensajes de un buzón por motivos legales
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setLegalHoldDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva retención
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingHolds ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : legalHolds?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay retenciones legales activas</p>
          ) : (
            <div className="space-y-2">
              {legalHolds?.map((hold) => (
                <div key={hold.id} className="flex items-center gap-3 rounded-md border p-3">
                  <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">{hold.mailboxId}</p>
                    <p className="text-xs text-muted-foreground truncate">{hold.reason}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(hold.createdAt)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteHoldMutation.isPending}
                    onClick={() => deleteHoldMutation.mutate(hold.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Derechos RGPD */}
      <Card>
        <CardHeader>
          <CardTitle>Derechos RGPD</CardTitle>
          <CardDescription>
            Exporta o elimina los datos de un buzón en cumplimiento del RGPD
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => { setGdprAction('export'); setGdprDialogOpen(true); }}
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar datos
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => { setGdprAction('forget'); setGdprDialogOpen(true); }}
          >
            <UserX className="mr-2 h-4 w-4" />
            Derecho al olvido
          </Button>
        </CardContent>
      </Card>

      {/* Dialog nueva retención legal */}
      <Dialog
        open={legalHoldDialogOpen}
        onOpenChange={(o) => { setLegalHoldDialogOpen(o); if (!o) legalHoldForm.reset(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva retención legal</DialogTitle>
            <DialogDescription>
              El buzón quedará bloqueado y no se podrán eliminar sus mensajes
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={legalHoldForm.handleSubmit((v) => createHoldMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>UUID del buzón</Label>
              <Input {...legalHoldForm.register('mailboxId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              {legalHoldForm.formState.errors.mailboxId && (
                <p className="text-xs text-destructive">{legalHoldForm.formState.errors.mailboxId.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Motivo</Label>
              <textarea
                {...legalHoldForm.register('reason')}
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                placeholder="Procedimiento judicial en curso…"
              />
              {legalHoldForm.formState.errors.reason && (
                <p className="text-xs text-destructive">{legalHoldForm.formState.errors.reason.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLegalHoldDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createHoldMutation.isPending}>
                {createHoldMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear retención
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog RGPD */}
      <Dialog
        open={gdprDialogOpen}
        onOpenChange={(o) => { setGdprDialogOpen(o); if (!o) gdprForm.reset(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {gdprAction === 'export' ? 'Exportar datos (RGPD)' : 'Derecho al olvido (RGPD)'}
            </DialogTitle>
            <DialogDescription>
              {gdprAction === 'export'
                ? 'Se generará una exportación de todos los datos del buzón indicado'
                : 'Se eliminarán permanentemente todos los datos del buzón. Esta acción no puede deshacerse.'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={gdprForm.handleSubmit((v) => gdprMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>UUID del buzón</Label>
              <Input {...gdprForm.register('mailboxId')} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              {gdprForm.formState.errors.mailboxId && (
                <p className="text-xs text-destructive">{gdprForm.formState.errors.mailboxId.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGdprDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={gdprMutation.isPending}
                variant={gdprAction === 'forget' ? 'destructive' : 'default'}
              >
                {gdprMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {gdprAction === 'export' ? 'Iniciar exportación' : 'Eliminar datos'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
