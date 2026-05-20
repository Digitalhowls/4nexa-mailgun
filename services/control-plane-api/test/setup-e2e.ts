/**
 * Variables de entorno necesarias para el módulo de configuración (Zod schema).
 * Estas se inyectan ANTES de que cualquier módulo NestJS sea cargado.
 */

process.env['NODE_ENV']                = 'test';
process.env['DATABASE_URL']            = 'postgresql://test:test@localhost:5432/test_control_plane';
process.env['JWT_ACCESS_SECRET']       = 'e2e-test-jwt-access-secret-32chars-minimum';
process.env['JWT_REFRESH_SECRET']      = 'e2e-test-jwt-refresh-secret-32charmin';
process.env['DKIM_ENCRYPTION_KEY']     = 'e2e-test-dkim-encryption-key-32chars';
process.env['NODE_AGENT_JWT_SECRET']   = 'e2e-test-node-agent-jwt-secret-32chars';
process.env['AUDIT_HMAC_SECRET']       = 'e2e-test-audit-hmac-secret-32charmin';
process.env['NODE_AGENT_BASE_URL']     = 'http://localhost:3099/agent';
process.env['API_PORT']                = '3001';
process.env['API_HOST']                = '0.0.0.0';
process.env['API_PREFIX']              = 'api/v1';
process.env['API_CORS_ORIGINS']        = 'http://localhost:3000';
process.env['REDIS_HOST']              = '127.0.0.1';
process.env['REDIS_PORT']              = '6379';
