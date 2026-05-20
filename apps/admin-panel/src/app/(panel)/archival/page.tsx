'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, Shield, Plus, Trash2, Loader2, Save, AlertTriangle } from 'lucide-react';
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
import {
  archivalApi,
  type SetArchivalPolicyPayload,
  type ArchivalStorageType,
} from '@/lib/api/archival.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, formatDate } from '@/lib/utils';

const STORAGE_TYPES: { value: ArchivalStorageType; label: string }[] = [
  { value: 'LOCAL_S3', label: 'S3 local (MinIO)' },
  { value: 'EXTERNAL_S3', label: 'S3 externo (AWS)' },
  { value: 'GLACIER', label: 'AWS Glacier' },
  { value: 'AZURE_BLOB', label: 'Azure Blob Storage' },
];

const policySchema = z.object({
  retentionYears: z.coerce.number().int().min(1).max(99),
  storageBackend: z.enum(['LOCAL_S3', 'EXTERNAL_S3', 'GLACIER', 'AZURE_BLOB'] as const),
  autoDeleteAfter: z.boolean().optional(),
  encryptArchive: z.boolean().optional(),
});

const holdSchema = z.object({
  mailboxId: z.string().uuid('UUID de buzón requerido'),
  reason: z.string().min(5, 'Describe el motivo del hold'),
});

type PolicyForm = z.infer<typeof policySchema>;
type HoldForm = z.infer<typeof holdSchema>;

export default function ArchivalPage() {
  const queryClient = useQueryClient();
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [gdprDialogOpen, setGdprDialogOpen] = useState(false);
  const [gdprMailboxId, setGdprMailboxId] = useState('');

  const { data: policy, isLoading: loadingPolicy } = useQuery({
    queryKey: ['archival-policy'],
    queryFn: () => archivalApi.getPolicy(),
  });

  const { data: legalHolds, isLoading: loadingHolds } = useQuery({
    queryKey: ['legal-holds'],
    queryFn: () => archivalApi.listLegalHolds(),
  });

  const {
    register: regPolicy,
    handleSubmit: handlePolicy,
    control: controlPolicy,
    formState: { errors: policyErrors },
  } = useForm<PolicyForm>({
    resolver: zodResolver(policySchema),
    values: policy
      ? {
          retentionYears: policy.retentionYears,
          storageBackend: policy.storageBackend,
          autoDeleteAfter: policy.autoDeleteAfter,
          encryptArchive: policy.encryptArchive,
        }
      : undefined,
  });

  const {
    register: regHold,
    handleSubmit: handleHold,
    reset: resetHold,
    formState: { errors: holdErrors },
  } = useForm<HoldForm>({ resolver: zodResolver(holdSchema) });

  const policyMutation = useMutation({
    mutationFn: (payload: SetArchivalPolicyPayload) => archivalApi.setPolicy(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archival-policy'] });
      toast({ title: 'Política de archivado guardada', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const holdMutation = useMutation({
    mutationFn: (payload: HoldForm) => archivalApi.createLegalHold(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-holds'] });
      toast({ title: 'Legal hold creado', variant: 'success' });
      setHoldDialogOpen(false);
      resetHold();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) => archivalApi.releaseLegalHold(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-holds'] });
      toast({ title: 'Legal hold liberado' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const gdprForgetMutation = useMutation({
    mutationFn: (mailboxId: string) => archivalApi.gdprForget(mailboxId),
    onSuccess: () => {
      toast({ title: 'Datos eliminados (GDPR)' });
      setGdprDialogOpen(false);
      setGdprMailboxId('');
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Archivado de correo</h2>
        <p className="text-muted-foreground">
          Políticas de retención, legal holds y cumplimiento GDPR
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Política de archivado */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              Política de retención
            </CardTitle>
            <CardDescription>Configura el backend y los años de retención de correos archivados.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPolicy ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <form
                onSubmit={handlePolicy((values) => policyMutation.mutate(values))}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label>Años de retención *</Label>
                  <Input {...regPolicy('retentionYears')} type="number" min={1} max={99} placeholder="7" />
                  {policyErrors.retentionYears && (
                    <p className="text-xs text-destructive">{policyErrors.retentionYears.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Backend de almacenamiento *</Label>
                  <Controller
                    control={controlPolicy}
                    name="storageBackend"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona backend…" />
                        </SelectTrigger>
                        <SelectContent>
                          {STORAGE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" {...regPolicy('autoDeleteAfter')} className="rounded" />
                    Auto-eliminar al expirar
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" {...regPolicy('encryptArchive')} className="rounded" />
                    Cifrar archivo
                  </label>
                </div>

                <Button type="submit" className="w-full" disabled={policyMutation.isPending}>
                  {policyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar política
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* GDPR */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Herramientas GDPR
            </CardTitle>
            <CardDescription>
              Exporta o elimina permanentemente los datos de un buzón por petición del usuario.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>ID del buzón</Label>
              <div className="flex gap-2">
                <Input
                  value={gdprMailboxId}
                  onChange={(e) => setGdprMailboxId(e.target.value)}
                  placeholder="UUID del buzón…"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={!gdprMailboxId}
                onClick={() => archivalApi.gdprExport(gdprMailboxId)
                  .then(() => toast({ title: 'Exportación iniciada' }))
                  .catch((err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }))
                }
              >
                Exportar datos
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={!gdprMailboxId}
                onClick={() => setGdprDialogOpen(true)}
              >
                Olvidar datos
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              La exportación genera un archivo ZIP con todos los correos del buzón. La eliminación es permanente e irreversible.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Legal Holds */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Legal Holds
              </CardTitle>
              <CardDescription>Preservación obligatoria de correos por motivos legales.</CardDescription>
            </div>
            <Button onClick={() => { resetHold(); setHoldDialogOpen(true); }} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo hold
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motivo</TableHead>
                <TableHead>Buzones</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingHolds &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                  </TableRow>
                ))}
              {!loadingHolds && (!legalHolds || legalHolds.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay legal holds activos.
                  </TableCell>
                </TableRow>
              )}
              {!loadingHolds && legalHolds?.map((hold) => (
                <TableRow key={hold.id}>
                  <TableCell className="font-medium">{hold.reason}</TableCell>
                  <TableCell className="font-mono text-xs">{hold.mailboxIds.length} buzón(es)</TableCell>
                  <TableCell>
                    <Badge variant={hold.isActive ? 'warning' : 'secondary'}>
                      {hold.isActive ? 'Activo' : 'Liberado'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(hold.startDate)}</TableCell>
                  <TableCell>
                    {hold.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => releaseMutation.mutate(hold.id)}
                        disabled={releaseMutation.isPending}
                      >
                        Liberar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog crear Legal Hold */}
      <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Legal Hold</DialogTitle>
            <DialogDescription>
              Bloquea la eliminación de correos de un buzón por motivos legales.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleHold((v) => holdMutation.mutate(v))} className="space-y-4">
            <div className="space-y-2">
              <Label>ID del buzón *</Label>
              <Input {...regHold('mailboxId')} placeholder="UUID del buzón" className="font-mono text-sm" />
              {holdErrors.mailboxId && <p className="text-xs text-destructive">{holdErrors.mailboxId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Input {...regHold('reason')} placeholder="Litigio caso #2026-001…" />
              {holdErrors.reason && <p className="text-xs text-destructive">{holdErrors.reason.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setHoldDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={holdMutation.isPending}>
                {holdMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear hold
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmar GDPR forget */}
      <Dialog open={gdprDialogOpen} onOpenChange={setGdprDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar datos del buzón (GDPR)</DialogTitle>
            <DialogDescription>
              Esta acción es <strong>permanente e irreversible</strong>. Se eliminarán todos los correos archivados del buzón{' '}
              <code className="rounded bg-muted px-1">{gdprMailboxId}</code>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGdprDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => gdprForgetMutation.mutate(gdprMailboxId)}
              disabled={gdprForgetMutation.isPending}
            >
              {gdprForgetMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar eliminación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
