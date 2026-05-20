'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Loader2, PauseCircle, PlayCircle, Link2 } from 'lucide-react';
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
import { tenantsApi, type Tenant, type CreateTenantPayload } from '@/lib/api/tenants.api';
import { plansApi } from '@/lib/api/plans.api';
import { nodesApi } from '@/lib/api/nodes.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, getStatusLabel, formatDate } from '@/lib/utils';

const tenantSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z.string().min(2, 'Mínimo 2 caracteres').regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  email: z.string().email('Email inválido'),
  planId: z.string().uuid('Selecciona un plan').optional().or(z.literal('')),
});

type TenantForm = z.infer<typeof tenantSchema>;

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success',
  TRIAL: 'warning',
  SUSPENDED: 'destructive',
  CANCELLED: 'secondary',
};

export default function TenantsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignNodeDialogOpen, setAssignNodeDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [assigningTenant, setAssigningTenant] = useState<Tenant | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tenants', page],
    queryFn: () => tenantsApi.findAll(page, 20),
  });

  const { data: plansData } = useQuery({
    queryKey: ['plans', 'all'],
    queryFn: () => plansApi.findAll(1, 100),
  });

  const { data: nodesData } = useQuery({
    queryKey: ['nodes', 'all'],
    queryFn: () => nodesApi.findAll(1, 100),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<TenantForm>({
    resolver: zodResolver(tenantSchema),
    defaultValues: { name: '', slug: '', email: '', planId: '' },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateTenantPayload) => tenantsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast({ title: 'Tenant creado', variant: 'success' });
      setDialogOpen(false);
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateTenantPayload> }) =>
      tenantsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast({ title: 'Tenant actualizado', variant: 'success' });
      setDialogOpen(false);
      setEditingTenant(null);
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const suspendMutation = useMutation({
    mutationFn: (id: string) => tenantsApi.suspend(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast({ title: 'Tenant suspendido' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => tenantsApi.reactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast({ title: 'Tenant reactivado', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const assignNodeMutation = useMutation({
    mutationFn: ({ id, nodeId }: { id: string; nodeId: string }) =>
      tenantsApi.assignNode(id, nodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast({ title: 'Nodo asignado', variant: 'success' });
      setAssignNodeDialogOpen(false);
      setAssigningTenant(null);
      setSelectedNodeId('');
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const openCreate = () => {
    setEditingTenant(null);
    reset({ name: '', slug: '', email: '', planId: '' });
    setDialogOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    reset({
      name: tenant.name,
      slug: tenant.slug,
      email: tenant.email,
      planId: tenant.planId ?? '',
    });
    setDialogOpen(true);
  };

  const onSubmit = (values: TenantForm) => {
    const payload: CreateTenantPayload = {
      name: values.name,
      slug: values.slug,
      email: values.email,
      planId: values.planId || undefined,
    };
    if (editingTenant) {
      updateMutation.mutate({ id: editingTenant.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tenants</h2>
          <p className="text-muted-foreground">
            Organizaciones de la plataforma ({data?.total ?? 0} en total)
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo tenant
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
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
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No hay tenants registrados.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              data?.items.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">
                    <div>
                      <p>{tenant.name}</p>
                      <code className="text-xs text-muted-foreground">{tenant.slug}</code>
                    </div>
                  </TableCell>
                  <TableCell>{tenant.email}</TableCell>
                  <TableCell>{tenant.plan?.name ?? '—'}</TableCell>
                  <TableCell>{tenant.node?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[tenant.status] ?? 'secondary'}>
                      {getStatusLabel(tenant.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(tenant.createdAt)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <span className="text-lg leading-none">⋯</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(tenant)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setAssigningTenant(tenant);
                            setSelectedNodeId(tenant.nodeId ?? '');
                            setAssignNodeDialogOpen(true);
                          }}
                        >
                          <Link2 className="mr-2 h-4 w-4" />
                          Asignar nodo
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {tenant.status === 'ACTIVE' || tenant.status === 'TRIAL' ? (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => suspendMutation.mutate(tenant.id)}
                            disabled={suspendMutation.isPending}
                          >
                            <PauseCircle className="mr-2 h-4 w-4" />
                            Suspender
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => reactivateMutation.mutate(tenant.id)}
                            disabled={reactivateMutation.isPending}
                          >
                            <PlayCircle className="mr-2 h-4 w-4" />
                            Reactivar
                          </DropdownMenuItem>
                        )}
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

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTenant ? 'Editar tenant' : 'Nuevo tenant'}</DialogTitle>
            <DialogDescription>
              {editingTenant ? 'Modifica los datos de la organización.' : 'Registra una nueva organización en la plataforma.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input {...register('name')} placeholder="Mi Empresa S.L." />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input {...register('slug')} placeholder="mi-empresa" />
                {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email de contacto</Label>
              <Input {...register('email')} type="email" placeholder="admin@empresa.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select onValueChange={(v) => setValue('planId', v)} defaultValue={editingTenant?.planId ?? ''}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin plan</SelectItem>
                  {plansData?.items.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingTenant ? 'Guardar' : 'Crear tenant'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog asignar nodo */}
      <Dialog open={assignNodeDialogOpen} onOpenChange={setAssignNodeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar nodo a {assigningTenant?.name}</DialogTitle>
            <DialogDescription>
              Selecciona el nodo de correo que gestionará este tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nodo</Label>
              <Select value={selectedNodeId} onValueChange={setSelectedNodeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un nodo" />
                </SelectTrigger>
                <SelectContent>
                  {nodesData?.items.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name} ({node.hostname})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignNodeDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!selectedNodeId || assignNodeMutation.isPending}
              onClick={() =>
                assigningTenant &&
                assignNodeMutation.mutate({ id: assigningTenant.id, nodeId: selectedNodeId })
              }
            >
              {assignNodeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
