'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { aliasesApi, type Alias, type CreateAliasPayload } from '@/lib/api/aliases.api';
import { domainsApi } from '@/lib/api/domains.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, formatDate } from '@/lib/utils';

const aliasSchema = z.object({
  localPart: z.string().min(1, 'Parte local requerida').regex(/^[a-z0-9._+-]+$/, 'Caracteres inválidos'),
  domainId: z.string().uuid('Selecciona un dominio'),
  destinations: z.string().min(1, 'Al menos un destino'),
});

type AliasForm = z.infer<typeof aliasSchema>;

export default function AliasesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAlias, setDeletingAlias] = useState<Alias | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['aliases', page],
    queryFn: () => aliasesApi.findAll(page, 20),
  });

  const { data: domainsData } = useQuery({
    queryKey: ['domains', 'all'],
    queryFn: () => domainsApi.findAll(1, 200),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<AliasForm>({
    resolver: zodResolver(aliasSchema),
    defaultValues: { localPart: '', domainId: '', destinations: '' },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateAliasPayload) => aliasesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aliases'] });
      toast({ title: 'Alias creado', variant: 'success' });
      setDialogOpen(false);
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      aliasesApi.update(id, { active }),
    onSuccess: (_, { active }) => {
      queryClient.invalidateQueries({ queryKey: ['aliases'] });
      toast({ title: active ? 'Alias activado' : 'Alias desactivado', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => aliasesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aliases'] });
      toast({ title: 'Alias eliminado' });
      setDeleteDialogOpen(false);
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const onSubmit = (values: AliasForm) => {
    const destinations = values.destinations
      .split(/[\n,]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    createMutation.mutate({ localPart: values.localPart, domainId: values.domainId, destinations });
  };

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Alias de correo</h2>
          <p className="text-muted-foreground">
            Redirecciones y listas de distribución ({data?.total ?? 0} en total)
          </p>
        </div>
        <Button onClick={() => { reset(); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo alias
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alias</TableHead>
              <TableHead>Destinos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No tienes alias configurados.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              data?.items.map((alias) => {
                const domain = domainsData?.items.find((d) => d.id === alias.domainId);
                return (
                  <TableRow key={alias.id}>
                    <TableCell className="font-mono">
                      {alias.localPart}@{domain?.domain ?? '…'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {alias.destinations.slice(0, 3).map((dest) => (
                          <code key={dest} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {dest}
                          </code>
                        ))}
                        {alias.destinations.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{alias.destinations.length - 3} más
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={alias.active ? 'success' : 'secondary'}>
                        {alias.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(alias.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <span className="text-lg leading-none">⋯</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => toggleMutation.mutate({ id: alias.id, active: !alias.active })}
                            disabled={toggleMutation.isPending}
                          >
                            {alias.active ? (
                              <><ToggleLeft className="mr-2 h-4 w-4" />Desactivar</>
                            ) : (
                              <><ToggleRight className="mr-2 h-4 w-4" />Activar</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => { setDeletingAlias(alias); setDeleteDialogOpen(true); }}
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

      {/* Dialog crear alias */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo alias</DialogTitle>
            <DialogDescription>Crea una redirección de correo en tu dominio.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Parte local (antes del @)</Label>
              <Input {...register('localPart')} placeholder="info" />
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
              <Label>Destinos</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={"admin@empresa.com\nsoporte@empresa.com"}
                {...register('destinations')}
              />
              <p className="text-xs text-muted-foreground">Separa varios destinos con comas o saltos de línea.</p>
              {errors.destinations && <p className="text-xs text-destructive">{errors.destinations.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar alias?</DialogTitle>
            <DialogDescription>
              Se eliminará el alias <strong>{deletingAlias?.localPart}</strong>. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingAlias && deleteMutation.mutate(deletingAlias.id)}
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
