'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Loader2, UploadCloud, ShieldCheck, Wrench } from 'lucide-react';
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
import { nodesApi, type Node, type CreateNodePayload } from '@/lib/api/nodes.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, getStatusLabel, formatDate } from '@/lib/utils';

const nodeSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  hostname: z.string().min(1, 'Hostname requerido'),
  ipAddress: z
    .string()
    .min(1, 'IP requerida')
    .regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'IP inválida'),
  agentUrl: z.string().url('URL inválida'),
  region: z.string().optional(),
});

type NodeForm = z.infer<typeof nodeSchema>;

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success',
  MAINTENANCE: 'warning',
  DRAINING: 'warning',
  QUARANTINED: 'destructive',
  OFFLINE: 'destructive',
};

export default function NodesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [deletingNode, setDeletingNode] = useState<Node | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['nodes', page],
    queryFn: () => nodesApi.findAll(page, 20),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<NodeForm>({
    resolver: zodResolver(nodeSchema),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateNodePayload) => nodesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      toast({ title: 'Nodo creado', variant: 'success' });
      setDialogOpen(false);
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateNodePayload> }) =>
      nodesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      toast({ title: 'Nodo actualizado', variant: 'success' });
      setDialogOpen(false);
      setEditingNode(null);
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => nodesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      toast({ title: 'Nodo eliminado' });
      setDeleteDialogOpen(false);
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const maintenanceMutation = useMutation({
    mutationFn: ({ id, maintenance }: { id: string; maintenance: boolean }) =>
      nodesApi.setMaintenance(id, maintenance),
    onSuccess: (node) => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      toast({
        title: node.maintenance ? 'Modo mantenimiento activado' : 'Modo mantenimiento desactivado',
        variant: 'success',
      });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const pushConfigMutation = useMutation({
    mutationFn: (id: string) => nodesApi.pushConfig(id),
    onSuccess: (result) => {
      toast({
        title: result.success ? 'Configuración aplicada' : 'Error al aplicar configuración',
        description: result.errors.length > 0 ? result.errors.join(', ') : undefined,
        variant: result.success ? 'success' : 'destructive',
      });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const openCreate = () => {
    setEditingNode(null);
    reset({ name: '', hostname: '', ipAddress: '', agentUrl: '', region: '' });
    setDialogOpen(true);
  };

  const openEdit = (node: Node) => {
    setEditingNode(node);
    reset({
      name: node.name,
      hostname: node.hostname,
      ipAddress: node.ipAddress,
      agentUrl: node.agentUrl,
      region: node.region ?? '',
    });
    setDialogOpen(true);
  };

  const onSubmit = (values: NodeForm) => {
    const payload = { ...values, region: values.region || undefined };
    if (editingNode) {
      updateMutation.mutate({ id: editingNode.id, payload });
    } else {
      createMutation.mutate(payload as CreateNodePayload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Nodos</h2>
          <p className="text-muted-foreground">
            Servidores de correo de la infraestructura ({data?.total ?? 0} en total)
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo nodo
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Hostname / IP</TableHead>
              <TableHead>Región</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No hay nodos registrados.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              data?.items.map((node) => (
                <TableRow key={node.id}>
                  <TableCell className="font-medium">{node.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{node.hostname}</span>
                      <span className="text-xs text-muted-foreground">{node.ipAddress}</span>
                    </div>
                  </TableCell>
                  <TableCell>{node.region ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant={STATUS_VARIANT[node.status] ?? 'secondary'}>
                        {getStatusLabel(node.status)}
                      </Badge>
                      {node.maintenance && (
                        <Badge variant="warning">
                          <Wrench className="mr-1 h-3 w-3" />
                          Mantenimiento
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(node.createdAt)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <span className="sr-only">Acciones</span>
                          <span className="text-lg leading-none">⋯</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(node)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            maintenanceMutation.mutate({ id: node.id, maintenance: !node.maintenance })
                          }
                        >
                          <Wrench className="mr-2 h-4 w-4" />
                          {node.maintenance ? 'Desactivar mantenimiento' : 'Activar mantenimiento'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => pushConfigMutation.mutate(node.id)}
                          disabled={pushConfigMutation.isPending}
                        >
                          <UploadCloud className="mr-2 h-4 w-4" />
                          Aplicar configuración
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setDeletingNode(node);
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
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="flex items-center px-3 text-sm">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingNode ? 'Editar nodo' : 'Nuevo nodo'}</DialogTitle>
            <DialogDescription>
              {editingNode ? 'Modifica los datos del servidor.' : 'Registra un nuevo servidor de correo.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input {...register('name')} placeholder="node-eu-01" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Hostname</Label>
                <Input {...register('hostname')} placeholder="mail1.ejemplo.com" />
                {errors.hostname && <p className="text-xs text-destructive">{errors.hostname.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>IP</Label>
                <Input {...register('ipAddress')} placeholder="10.0.0.1" />
                {errors.ipAddress && <p className="text-xs text-destructive">{errors.ipAddress.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Región</Label>
                <Input {...register('region')} placeholder="eu-west-1" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>URL del agente</Label>
              <Input {...register('agentUrl')} placeholder="http://10.0.0.1:9000" />
              {errors.agentUrl && <p className="text-xs text-destructive">{errors.agentUrl.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingNode ? 'Guardar' : 'Crear nodo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminación */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar nodo?</DialogTitle>
            <DialogDescription>
              Se eliminará el nodo <strong>{deletingNode?.name}</strong>. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deletingNode && deleteMutation.mutate(deletingNode.id)}
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
