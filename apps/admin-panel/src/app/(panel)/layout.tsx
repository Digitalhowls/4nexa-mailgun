'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { useAuthStore } from '@/store/auth.store';

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  // Doble verificación client-side (el middleware ya protege a nivel de cookie)
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated()) {
    return null; // Evitar flash de contenido no autenticado
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">{children}</main>
      </div>
    </div>
  );
}
