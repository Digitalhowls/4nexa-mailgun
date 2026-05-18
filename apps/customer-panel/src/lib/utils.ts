import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: es });
}

export function formatDateShort(date: string | Date): string {
  return format(new Date(date), 'dd/MM/yyyy', { locale: es });
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es });
}

export function formatBytes(bytes: string | number): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(b) || b === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e['message'] === 'string') return e['message'];
    const response = e['response'] as Record<string, unknown> | undefined;
    if (response) {
      const data = response['data'] as Record<string, unknown> | undefined;
      if (data && typeof data['message'] === 'string') return data['message'];
      if (data && Array.isArray(data['message'])) return (data['message'] as string[]).join(', ');
    }
  }
  return 'Ha ocurrido un error inesperado';
}

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  DELETED: 'Eliminado',
  PENDING: 'Pendiente',
  VERIFIED: 'Verificado',
  FAILED: 'Fallido',
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? capitalize(status);
}
