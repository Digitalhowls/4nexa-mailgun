import { type ClassValue, clsx } from 'clsx';
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

/** Formatea bytes a unidad legible: KB, MB, GB, TB */
export function formatBytes(bytes: number | string | bigint): string {
  const n = typeof bytes === 'bigint' ? Number(bytes) : Number(bytes);
  if (n === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${parseFloat((n / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/** Capitaliza primera letra */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** Traduce status codes a español */
export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  DELETED: 'Eliminado',
  TRIAL: 'Prueba',
  CANCELLED: 'Cancelado',
  PENDING_DNS: 'DNS Pendiente',
  PENDING_PAYMENT: 'Pago Pendiente',
  MAINTENANCE: 'Mantenimiento',
  DRAINING: 'Drenando',
  QUARANTINED: 'Cuarentena',
  OFFLINE: 'Sin conexión',
  UNCHECKED: 'Sin verificar',
  VALID: 'Válido',
  INVALID: 'Inválido',
  MISSING: 'Ausente',
  GRACE: 'Gracia',
  RESTRICTED: 'Restringido',
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Extrae el mensaje de error de una respuesta Axios/API */
export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const res = (error as { response?: { data?: { message?: string } } }).response;
    if (res?.data?.message) return res.data.message;
  }
  if (error instanceof Error) return error.message;
  return 'Ha ocurrido un error inesperado';
}
