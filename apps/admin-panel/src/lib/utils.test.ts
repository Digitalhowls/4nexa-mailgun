import { describe, it, expect } from 'vitest';
import {
  cn,
  formatBytes,
  capitalize,
  getStatusLabel,
  STATUS_LABELS,
} from '@/lib/utils';

describe('cn()', () => {
  it('combina clases simples', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('descarta valores falsy', () => {
    expect(cn('a', undefined, false, null, 'b')).toBe('a b');
  });

  it('fusiona clases Tailwind en conflicto', () => {
    const result = cn('p-2', 'p-4');
    expect(result).toBe('p-4');
  });
});

describe('formatBytes()', () => {
  it('devuelve "0 B" para 0', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formatea kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('formatea megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('formatea gigabytes con decimales', () => {
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB');
  });

  it('acepta bigint', () => {
    expect(formatBytes(BigInt(2048))).toBe('2 KB');
  });

  it('acepta string numérico', () => {
    expect(formatBytes('2097152')).toBe('2 MB');
  });
});

describe('capitalize()', () => {
  it('capitaliza la primera letra', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('pone el resto en minúscula', () => {
    expect(capitalize('WORLD')).toBe('World');
  });
});

describe('getStatusLabel()', () => {
  it('traduce ACTIVE', () => {
    expect(getStatusLabel('ACTIVE')).toBe('Activo');
  });

  it('traduce SUSPENDED', () => {
    expect(getStatusLabel('SUSPENDED')).toBe('Suspendido');
  });

  it('devuelve el valor original si no está en el mapa', () => {
    expect(getStatusLabel('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS');
  });

  it('traduce todos los valores del mapa STATUS_LABELS', () => {
    for (const [key, value] of Object.entries(STATUS_LABELS)) {
      expect(getStatusLabel(key)).toBe(value);
    }
  });
});
