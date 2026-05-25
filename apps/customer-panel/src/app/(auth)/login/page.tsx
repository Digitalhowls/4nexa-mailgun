'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/store/auth.store';
import { getErrorMessage } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
  totpCode: z.string().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokens, setUser } = useAuthStore();
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginForm) => {
    setError(null);
    try {
      const result = await authApi.login(values);

      if (result.requiresTotp && !values.totpCode) {
        setRequiresTotp(true);
        return;
      }

      setTokens(result.accessToken, result.refreshToken);
      const user = await authApi.me();
      setUser(user);

      // Cookie para el middleware SSR
      document.cookie = 'cp-session=1; path=/; max-age=28800; samesite=strict';

      const next = searchParams.get('next') ?? '/dashboard';
      router.push(next);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Mail className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">4nexa Mail</h1>
          <p className="mt-1 text-sm text-muted-foreground">Panel de cliente — accede a tu cuenta</p>
        </div>

        {/* Formulario */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tu@empresa.com"
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>

            {requiresTotp && (
              <div className="space-y-2">
                <Label htmlFor="totpCode">Código de autenticación (TOTP)</Label>
                <Input
                  id="totpCode"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  {...register('totpCode')}
                />
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {requiresTotp ? 'Verificar código' : 'Iniciar sesión'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
