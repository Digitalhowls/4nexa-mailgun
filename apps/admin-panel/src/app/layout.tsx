import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/providers/query-provider';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: '4nexa Admin',
  description: 'Panel de administración de la plataforma 4nexa',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background antialiased">
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
