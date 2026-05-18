'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { KeyRound, Loader2 } from 'lucide-react';
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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { mailboxesApi, type Mailbox } from '@/lib/api/mailboxes.api';
import { domainsApi } from '@/lib/api/domains.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, getStatusLabel, formatBytes, formatDate } from '@/lib/utils';

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirm: z.string().min(1, 'Confirma la contraseña'),
}).refine((d) => d.password === d.confirm, {
  message: 'Las contraseñas no coinciden',
  path: ['confirm'],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success',
  SUSPENDED: 'destructive',
  DELETED: 'secondary',
};

export default function MailboxesPage() {
  const [page, setPage] = useState(1);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [selectedMailbox, setSelectedMailbox] = useState<Mailbox | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mailboxes', page],
    queryFn: () => mailboxesApi.findAll(page, 20),
  });

  const { data: domainsData } = useQuery({
    queryKey: ['domains', 'all'],
    queryFn: () => domainsApi.findAll(1, 200),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      mailboxesApi.resetPassword(id, password),
    onSuccess: () => {
      toast({ title: 'Contraseña actualizada', variant: 'success' });
      setResetDialogOpen(false);
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const onSubmitReset = (values: ResetPasswordForm) => {
    if (selectedMailbox) {
      resetPasswordMutation.mutate({ id: selectedMailbox.id, password: values.password });
    }
  };

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Mis buzones</h2>
        <p className="text-muted-foreground">
          Cuentas de correo de tu organización ({data?.total ?? 0} en total)
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Cuota</TableHead>
              <TableHead>Uso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Último acceso</TableHead>
              <TableHead className="w-[140px]">Acciones</TableHead>
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
                  No hay buzones registrados. Contacta con soporte.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              data?.items.map((mailbox) => {
                const domain = domainsData?.items.find((d) => d.id === mailbox.domainId);
                const usedBytes = parseInt(mailbox.usedBytes, 10);
                const quotaBytes = parseInt(mailbox.quotaBytes, 10);
                const pct = quotaBytes > 0 ? Math.round((usedBytes / quotaBytes) * 100) : 0;
                return (
                  <TableRow key={mailbox.id}>
                    <TableCell className="font-mono">
                      {mailbox.localPart}@{domain?.domain ?? '…'}
                    </TableCell>
                    <TableCell>{formatBytes(mailbox.quotaBytes)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[mailbox.status] ?? 'secondary'}>
                        {getStatusLabel(mailbox.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {mailbox.lastLoginAt ? formatDate(mailbox.lastLoginAt) : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedMailbox(mailbox);
                          reset();
                          setResetDialogOpen(true);
                        }}
                      >
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                        Contraseña
                      </Button>
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

      {/* Dialog cambio contraseña */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>
              Nueva contraseña para <strong>{selectedMailbox?.localPart}</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmitReset)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nueva contraseña</Label>
              <Input {...register('password')} type="password" />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Confirmar contraseña</Label>
              <Input {...register('confirm')} type="password" />
              {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Actualizar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
