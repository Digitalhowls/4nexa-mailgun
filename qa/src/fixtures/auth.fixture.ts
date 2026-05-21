/**
 * auth.fixture.ts
 * Genera tokens JWT para los tests de la QA suite.
 * El secret debe coincidir con JWT_ACCESS_SECRET del backend.
 */
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env['JWT_ACCESS_SECRET'] ?? 'dev-secret-change-in-production';

export type QaRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'SUPPORT'
  | 'TENANT_OWNER'
  | 'TENANT_ADMIN'
  | 'TENANT_SUPPORT'
  | 'READ_ONLY';

export interface TokenPayload {
  sub?: string;
  email?: string;
  role: QaRole;
  tenantId?: string | null;
  jti?: string;
}

export function makeToken(payload: TokenPayload, expiresIn: number = 3600): string {
  return jwt.sign(
    {
      sub:      payload.sub      ?? 'qa-user-001',
      email:    payload.email    ?? 'qa@4nexa.io',
      role:     payload.role,
      tenantId: payload.tenantId ?? null,
      jti:      payload.jti      ?? `qa-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    JWT_SECRET,
    { expiresIn },
  );
}

// ─── Tokens de conveniencia ────────────────────────────────────────────────

/** Token de administrador global (sin tenantId) */
export const adminToken    = () => makeToken({ role: 'ADMIN' });

/** Token de super admin */
export const superAdminToken = () => makeToken({ role: 'SUPER_ADMIN' });

/** Token de soporte */
export const supportToken  = () => makeToken({ role: 'SUPPORT' });

/** Token de propietario de tenant */
export const tenantOwnerToken = (tenantId = 'qa-tenant-001') =>
  makeToken({ role: 'TENANT_OWNER', tenantId, email: 'owner@qa-tenant.io' });

/** Token de admin de tenant */
export const tenantAdminToken = (tenantId = 'qa-tenant-001') =>
  makeToken({ role: 'TENANT_ADMIN', tenantId, email: 'admin@qa-tenant.io' });

/** Cabecera Authorization lista para usar en axios */
export const authHeader = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});
