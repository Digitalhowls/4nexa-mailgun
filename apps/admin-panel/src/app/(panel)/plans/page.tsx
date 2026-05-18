'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
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
import { plansApi, type Plan, type CreatePlanPayload } from '@/lib/api/plans.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

const planSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  slug: z.string().min(1, 'Slug requerido').regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  maxDomains: z.coerce.number().int().min(1),
  maxMailboxes: z.coerce.number().int().min(1),
  maxAliases: z.coerce.number().int().min(0),
  maxStorageGb: z.coerce.number().int().min(1),
  price: z.coerce.number().min(0),
  currency: z.string().length(3, 'Código ISO 4217 de 3 letras'),
  isPublic: z.boolean(),
});

type PlanForm = z.infer<typeof planSchema>;

const DEFAULT_VALUES: PlanForm = {
  name: '',
  slug: '',
  maxDomains: 5,
  maxMailboxes: 50,
  maxAliases: 100,
  maxStorageGb: 10,
  price: 0,
  currency: 'EUR',
  isPublic: false,
};

export default function PlansPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['plans', page],
    queryFn: () => plansApi.findAll(page, 20),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PlanForm>({ resolver: zodResolver(planSchema), defaultValues: DEFAULT_VALUES });

  const createMutation = useMutation({
    mutationFn: (payload: CreatePlanPayload) => plansApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      toast({ title: 'Plan creado', variant: 'success' });
      setDialogOpen(false);
      reset(DEFAULT_VALUES);
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreatePlanPayload> }) =>
      plansApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      toast({ title: 'Plan actualizado', variant: 'success' });
      setDialogOpen(false);
      setEditingPlan(null);
      reset(DEFAULT_VALUES);
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => plansApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      toast({ title: 'Plan eliminado' });
      setDeleteDialogOpen(false);
      setDeletingPlan(null);
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const openCreate = () => {
    setEditingPlan(null);
    reset(DEFAULT_VALUES);
    setDialogOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    reset({
      name: plan.name,
      slug: plan.slug,
      maxDomains: plan.maxDomains,
      maxMailboxes: plan.maxMailboxes,
      maxAliases: plan.maxAliases,
      maxStorageGb: plan.maxStorageGb,
      price: plan.price,
      currency: plan.currency,
      isPublic: plan.isPublic,
    });
    setDialogOpen(true);
  };

  const onSubmit = (values: PlanForm) => {
    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, payload: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Planes</h2>
          <p className="text-muted-foreground">
            Gestión de planes de servicio ({data?.total ?? 0} en total)
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo plan
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Dominios</TableHead>
              <TableHead>Buzones</TableHead>
              <TableHead>Almacen.</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No hay planes. Crea el primero.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              data?.items.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">{plan.slug}</code>
                  </TableCell>
                  <TableCell>{plan.maxDomains}</TableCell>
                  <TableCell>{plan.maxMailboxes}</TableCell>
                  <TableCell>{plan.maxStorageGb} GB</TableCell>
                  <TableCell>
                    {plan.price === 0
                      ? 'Gratis'
                      : `${plan.price.toFixed(2)} ${plan.currency}`}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {plan.isActive ? (
                        <Badge variant="success">Activo</Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                      {plan.isPublic && <Badge variant="info">Público</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(plan)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeletingPlan(plan);
                          setDeleteDialogOpen(true);
                        }}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="flex items-center px-3 text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Editar plan' : 'Nuevo plan'}</DialogTitle>
            <DialogDescription>
              {editingPlan
                ? 'Modifica los datos del plan de servicio.'
                : 'Introduce los datos para crear un nuevo plan de servicio.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input {...register('name')} placeholder="Plan Básico" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input {...register('slug')} placeholder="plan-basico" />
                {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Máx. Dominios</Label>
                <Input type="number" min={1} {...register('maxDomains')} />
              </div>
              <div className="space-y-2">
                <Label>Máx. Buzones</Label>
                <Input type="number" min={1} {...register('maxMailboxes')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Máx. Alias</Label>
                <Input type="number" min={0} {...register('maxAliases')} />
              </div>
              <div className="space-y-2">
                <Label>Almacenamiento (GB)</Label>
                <Input type="number" min={1} {...register('maxStorageGb')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Precio</Label>
                <Input type="number" step="0.01" min={0} {...register('price')} />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Input {...register('currency')} placeholder="EUR" maxLength={3} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isPublic" {...register('isPublic')} className="h-4 w-4" />
              <Label htmlFor="isPublic">Visible públicamente</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingPlan ? 'Guardar cambios' : 'Crear plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmación eliminación */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar plan?</DialogTitle>
            <DialogDescription>
              Esta acción eliminará el plan{' '}
              <strong>{deletingPlan?.name}</strong>. Esta operación no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingPlan && deleteMutation.mutate(deletingPlan.id)}
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
