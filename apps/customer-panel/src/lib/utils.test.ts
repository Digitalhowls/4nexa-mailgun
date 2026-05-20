import { describe, it, expect } from 'vitest';
import { cn, formatBytes, capitalize, getStatusLabel, getErrorMessage, STATUS_LABELS } from '@/lib/utils';

describe('cn()', () => {
  it('combina clases simples', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('descarta valores falsy', () => {
    expect(cn('a', undefined, false, null, 'b')).toBe('a b');
  });

  it('fusiona clases Tailwind en conflicto', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});

describe('formatBytes()', () => {
  it('devuelve "0 B" para 0', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('devuelve "0 B" para string no numérico', () => {
    expect(formatBytes('abc')).toBe('0 B');
  });

  it('formatea kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
  });

  it('formatea megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
  });

  it('acepta string numérico', () => {
    expect(formatBytes('2097152')).toBe('2.00 MB');
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

  it('capitaliza el status cuando no está en el mapa', () => {
    expect(getStatusLabel('unknown')).toBe('Unknown');
  });

  it('traduce todos los valores del mapa', () => {
    for (const [key, value] of Object.entries(STATUS_LABELS)) {
      expect(getStatusLabel(key)).toBe(value);
    }
  });
});

describe('getErrorMessage()', () => {
  it('extrae message de un Error', () => {
    expect(getErrorMessage(new Error('Algo salió mal'))).toBe('Algo salió mal');
  });

  it('devuelve mensaje genérico para valores desconocidos', () => {
    expect(getErrorMessage(null)).toBe('Ha ocurrido un error inesperado');
    expect(getErrorMessage(42)).toBe('Ha ocurrido un error inesperado');
  });

  it('extrae message de respuesta axios-like', () => {
    const axiosError = { response: { data: { message: 'Not Found' } } };
    expect(getErrorMessage(axiosError)).toBe('Not Found');
  });

  it('une un array de mensajes de validación', () => {
    const axiosError = { response: { data: { message: ['campo requerido', 'email inválido'] } } };
    expect(getErrorMessage(axiosError)).toBe('campo requerido, email inválido');
  });
});
