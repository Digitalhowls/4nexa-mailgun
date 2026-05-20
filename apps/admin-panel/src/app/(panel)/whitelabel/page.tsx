'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Palette, Trash2, Loader2, Save, Globe } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { whitelabelApi, type WhitelabelConfigPayload } from '@/lib/api/whitelabel.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, formatDate } from '@/lib/utils';

const schema = z.object({
  brandName: z.string().min(2, 'Mínimo 2 caracteres'),
  brandDomain: z.string().min(3, 'Dominio requerido'),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido (#RRGGBB)'),
  logoUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  supportEmail: z.string().email('Email inválido').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export default function WhitelabelPage() {
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['whitelabel'],
    queryFn: () => whitelabelApi.get(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: config
      ? {
          brandName: config.brandName ?? '',
          brandDomain: config.brandDomain ?? '',
          primaryColor: config.primaryColor ?? '#3B82F6',
          logoUrl: config.logoUrl ?? '',
          supportEmail: config.supportEmail ?? '',
        }
      : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: WhitelabelConfigPayload) => whitelabelApi.set(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whitelabel'] });
      toast({ title: 'Configuración guardada', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => whitelabelApi.remove(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whitelabel'] });
      reset({ brandName: '', brandDomain: '', primaryColor: '#3B82F6', logoUrl: '', supportEmail: '' });
      setDeleteDialogOpen(false);
      toast({ title: 'Configuración eliminada' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const onSubmit = (values: FormValues) => {
    saveMutation.mutate({
      brandName: values.brandName,
      brandDomain: values.brandDomain,
      primaryColor: values.primaryColor,
      logoUrl: values.logoUrl || undefined,
      supportEmail: values.supportEmail || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">White-label</h2>
          <p className="text-muted-foreground">Personalización de marca para el tenant activo</p>
        </div>
        {config && (
          <Badge variant={config.isActive ? 'success' : 'secondary'}>
            {config.isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Formulario principal */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Configuración de marca
            </CardTitle>
            <CardDescription>
              Define nombre, dominio, colores y logos del tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nombre de marca *</Label>
                    <Input {...register('brandName')} placeholder="Acme Mail" />
                    {errors.brandName && <p className="text-xs text-destructive">{errors.brandName.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Dominio de marca *</Label>
                    <Input {...register('brandDomain')} placeholder="mail.acme.com" />
                    {errors.brandDomain && <p className="text-xs text-destructive">{errors.brandDomain.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Color primario * <span className="text-muted-foreground text-xs">(hex)</span></Label>
                  <div className="flex gap-2">
                    <Input {...register('primaryColor')} placeholder="#3B82F6" className="font-mono" />
                    <input type="color" {...register('primaryColor')} className="h-10 w-10 cursor-pointer rounded border" />
                  </div>
                  {errors.primaryColor && <p className="text-xs text-destructive">{errors.primaryColor.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>URL del logotipo</Label>
                  <Input {...register('logoUrl')} placeholder="https://cdn.acme.com/logo.svg" />
                  {errors.logoUrl && <p className="text-xs text-destructive">{errors.logoUrl.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Email de soporte</Label>
                  <Input {...register('supportEmail')} type="email" placeholder="soporte@acme.com" />
                  {errors.supportEmail && <p className="text-xs text-destructive">{errors.supportEmail.message}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  {config && (
                    <Button type="button" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar configuración
                    </Button>
                  )}
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Vista previa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : config ? (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">Nombre</p>
                  <p className="font-semibold">{config.brandName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dominio</p>
                  <p className="font-mono text-sm">{config.brandDomain}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Color primario</p>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-5 w-5 rounded border"
                      style={{ backgroundColor: config.primaryColor }}
                    />
                    <span className="font-mono text-sm">{config.primaryColor}</span>
                  </div>
                </div>
                {config.supportEmail && (
                  <div>
                    <p className="text-xs text-muted-foreground">Email soporte</p>
                    <p className="text-sm">{config.supportEmail}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Última actualización</p>
                  <p className="text-sm">{formatDate(config.updatedAt)}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sin configuración activa.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog confirmar eliminación */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar configuración white-label</DialogTitle>
            <DialogDescription>
              Se eliminará toda la personalización de marca del tenant. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
