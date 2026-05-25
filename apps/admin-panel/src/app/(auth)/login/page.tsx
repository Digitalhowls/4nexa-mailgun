'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Mail, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/lib/api/auth.api';
import { getErrorMessage } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
  totpCode: z.string().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokens, setUser } = useAuthStore();
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginForm) => {
    setError(null);
    try {
      const result = await authApi.login({
        email: values.email,
        password: values.password,
        totpCode: values.totpCode,
      });

      if (result.requiresTotp) {
        setRequiresTotp(true);
        return;
      }

      // Guardar tokens en store
      setTokens(result.accessToken, result.refreshToken);

      // Obtener datos del usuario autenticado
      const me = await authApi.me();
      setUser(me);

      // Establecer cookie de sesión para el middleware
      document.cookie = `auth-session=1; path=/; samesite=strict; max-age=${60 * 60 * 8}`; // 8h

      const next = searchParams.get('next') ?? '/dashboard';
      router.push(next);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md px-4">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">4nexa</h1>
          <p className="text-muted-foreground">Panel de Administración</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>
              Accede con tu cuenta de administrador de la plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">
                  <Mail className="mr-1 inline h-3.5 w-3.5" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@ejemplo.com"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  <Lock className="mr-1 inline h-3.5 w-3.5" />
                  Contraseña
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>

              {requiresTotp && (
                <div className="space-y-2">
                  <Label htmlFor="totpCode">
                    <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                    Código de autenticación (TOTP)
                  </Label>
                  <Input
                    id="totpCode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    autoComplete="one-time-code"
                    {...register('totpCode')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Introduce el código de 6 dígitos de tu aplicación de autenticación.
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {requiresTotp ? 'Verificar y entrar' : 'Iniciar sesión'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
