'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, KeyRound } from 'lucide-react';
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
import { mailboxesApi, type Mailbox, type CreateMailboxPayload } from '@/lib/api/mailboxes.api';
import { domainsApi } from '@/lib/api/domains.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, getStatusLabel, formatBytes, formatDate } from '@/lib/utils';

const createSchema = z.object({
  localPart: z.string().min(1, 'Parte local requerida').regex(/^[a-z0-9._+-]+$/, 'Caracteres inválidos'),
  domainId: z.string().uuid('Selecciona un dominio'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  quotaBytes: z.coerce.number().int().min(1).default(5368709120), // 5 GB por defecto
});

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirm: z.string().min(1, 'Confirma la contraseña'),
}).refine((d) => d.password === d.confirm, {
  message: 'Las contraseñas no coinciden',
  path: ['confirm'],
});

type CreateForm = z.infer<typeof createSchema>;
type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success',
  SUSPENDED: 'destructive',
  DELETED: 'secondary',
};

export default function MailboxesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [deletingMailbox, setDeletingMailbox] = useState<Mailbox | null>(null);
  const [resetPasswordMailbox, setResetPasswordMailbox] = useState<Mailbox | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mailboxes', page],
    queryFn: () => mailboxesApi.findAll(page, 20),
  });

  const { data: domainsData } = useQuery({
    queryKey: ['domains', 'all'],
    queryFn: () => domainsApi.findAll(1, 200),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { localPart: '', domainId: '', password: '', quotaBytes: 5368709120 },
  });

  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    reset: resetPasswordForm,
    formState: { errors: errorsReset },
  } = useForm<ResetPasswordForm>({ resolver: zodResolver(resetPasswordSchema) });

  const createMutation = useMutation({
    mutationFn: (payload: CreateMailboxPayload) => mailboxesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      toast({ title: 'Buzón creado', variant: 'success' });
      setDialogOpen(false);
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mailboxesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mailboxes'] });
      toast({ title: 'Buzón eliminado' });
      setDeleteDialogOpen(false);
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      mailboxesApi.resetPassword(id, password),
    onSuccess: () => {
      toast({ title: 'Contraseña restablecida', variant: 'success' });
      setResetPasswordDialogOpen(false);
      resetPasswordForm();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const onSubmitCreate = (values: CreateForm) => {
    createMutation.mutate(values as CreateMailboxPayload);
  };

  const onSubmitResetPassword = (values: ResetPasswordForm) => {
    if (resetPasswordMailbox) {
      resetPasswordMutation.mutate({ id: resetPasswordMailbox.id, password: values.password });
    }
  };

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Buzones</h2>
          <p className="text-muted-foreground">
            Cuentas de correo ({data?.total ?? 0} en total)
          </p>
        </div>
        <Button onClick={() => { reset(); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo buzón
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Dominio</TableHead>
              <TableHead>Cuota</TableHead>
              <TableHead>Uso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No hay buzones registrados.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              data?.items.map((mailbox) => {
                const domain = domainsData?.items.find((d) => d.id === mailbox.domainId);
                return (
                  <TableRow key={mailbox.id}>
                    <TableCell className="font-mono">
                      {mailbox.localPart}@{domain?.domain ?? mailbox.domainId.slice(0, 8) + '…'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {domain?.domain ?? '—'}
                    </TableCell>
                    <TableCell>{formatBytes(mailbox.quotaBytes)}</TableCell>
                    <TableCell>{formatBytes(mailbox.usedBytes)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[mailbox.status] ?? 'secondary'}>
                        {getStatusLabel(mailbox.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(mailbox.createdAt)}</TableCell>
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
                              setResetPasswordMailbox(mailbox);
                              resetPasswordForm();
                              setResetPasswordDialogOpen(true);
                            }}
                          >
                            <KeyRound className="mr-2 h-4 w-4" />
                            Restablecer contraseña
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setDeletingMailbox(mailbox);
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
                );
              })}
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

      {/* Dialog crear buzón */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo buzón</DialogTitle>
            <DialogDescription>Crea una cuenta de correo en un dominio existente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmitCreate)} className="space-y-4">
            <div className="space-y-2">
              <Label>Parte local (antes del @)</Label>
              <Input {...register('localPart')} placeholder="usuario" />
              {errors.localPart && <p className="text-xs text-destructive">{errors.localPart.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Dominio</Label>
              <Select onValueChange={(v) => setValue('domainId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un dominio" />
                </SelectTrigger>
                <SelectContent>
                  {domainsData?.items.filter((d) => d.status !== 'DELETED').map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.domainId && <p className="text-xs text-destructive">{errors.domainId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input {...register('password')} type="password" />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Cuota (bytes) — por defecto 5 GB</Label>
              <Input type="number" {...register('quotaBytes')} min={1} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear buzón
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog restablecer contraseña */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
            <DialogDescription>
              Nueva contraseña para el buzón <strong>{resetPasswordMailbox?.localPart}</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitReset(onSubmitResetPassword)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nueva contraseña</Label>
              <Input {...registerReset('password')} type="password" />
              {errorsReset.password && <p className="text-xs text-destructive">{errorsReset.password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Confirmar contraseña</Label>
              <Input {...registerReset('confirm')} type="password" />
              {errorsReset.confirm && <p className="text-xs text-destructive">{errorsReset.confirm.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetPasswordDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Restablecer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar buzón?</DialogTitle>
            <DialogDescription>
              Se eliminará el buzón <strong>{deletingMailbox?.localPart}</strong>. Esta operación no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingMailbox && deleteMutation.mutate(deletingMailbox.id)}
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
