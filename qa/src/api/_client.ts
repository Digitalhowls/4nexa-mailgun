/**
 * _client.ts
 * Cliente axios configurado para los tests API del QA suite.
 */
import axios, { AxiosInstance } from 'axios';

export const BASE_URL = (process.env['QA_API_URL'] ?? 'http://localhost:3001').replace(/\/$/, '');
export const API_BASE  = `${BASE_URL}/api/v1`;
export const TIMEOUT   = Number(process.env['QA_REQUEST_TIMEOUT'] ?? 10_000);

/** Cliente con timeout configurado y sin lanzar excepciones automáticas */
export function createClient(token?: string): AxiosInstance {
  return axios.create({
    baseURL: API_BASE,
    timeout: TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    validateStatus: () => true, // Nunca lanzar por status HTTP
  });
}

/** Extrae el status y body de una respuesta axios sin lanzar */
export async function request(
  client: AxiosInstance,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  url: string,
  data?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await client[method](url, data as Record<string, unknown>);
  return { status: res.status, body: res.data };
}

/** Verifica si el servidor está disponible */
export async function isApiReachable(): Promise<boolean> {
  try {
    const client = createClient();
    const res = await client.get('/health');
    return res.status < 500;
  } catch {
    return false;
  }
}
