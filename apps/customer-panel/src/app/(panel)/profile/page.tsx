'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2, User, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Introduce tu contraseña actual'),
  newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmPassword: z.string().min(1, 'Confirma la nueva contraseña'),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
  });

  const changePasswordMutation = useMutation({
    mutationFn: (values: ChangePasswordForm) =>
      authApi.changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      toast({ title: 'Contraseña actualizada correctamente', variant: 'success' });
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const onSubmit = (values: ChangePasswordForm) => changePasswordMutation.mutate(values);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Mi cuenta</h2>
        <p className="text-muted-foreground">Gestiona tu información de acceso</p>
      </div>

      {/* Info de cuenta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Información de cuenta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Rol</p>
              <p className="font-medium">{user?.role ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">ID de cuenta</p>
              <code className="font-mono text-xs">{user?.id ?? '—'}</code>
            </div>
            {user?.tenantId && (
              <div>
                <p className="text-muted-foreground">Tenant ID</p>
                <code className="font-mono text-xs">{user.tenantId}</code>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cambio de contraseña */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Cambiar contraseña
          </CardTitle>
          <CardDescription>
            Usa una contraseña fuerte de al menos 8 caracteres.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Contraseña actual</Label>
              <Input {...register('currentPassword')} type="password" autoComplete="current-password" />
              {errors.currentPassword && (
                <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Nueva contraseña</Label>
              <Input {...register('newPassword')} type="password" autoComplete="new-password" />
              {errors.newPassword && (
                <p className="text-xs text-destructive">{errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Confirmar nueva contraseña</Label>
              <Input {...register('confirmPassword')} type="password" autoComplete="new-password" />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={changePasswordMutation.isPending}>
                {changePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Actualizar contraseña
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
