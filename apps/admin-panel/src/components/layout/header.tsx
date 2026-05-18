'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/lib/api/auth.api';
import { toast } from '@/components/ui/use-toast';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Aunque falle la llamada, limpiamos el estado local
    } finally {
      logout();
      toast({ title: 'Sesión cerrada', variant: 'default' });
      router.push('/login');
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      {title && (
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      )}
      {!title && <div />}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">{user?.email ?? 'Usuario'}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{user?.email}</p>
              <p className="text-xs text-muted-foreground">{user?.role}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
