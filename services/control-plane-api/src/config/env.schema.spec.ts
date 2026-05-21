import { EnvSchema } from './env.schema';

// Configuración mínima válida — todas las variables obligatorias con valores correctos
const BASE = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: '12345678901234567890123456789012', // 32 chars exactos
  JWT_REFRESH_SECRET: '12345678901234567890123456789099',
  DKIM_ENCRYPTION_KEY: '1234567890123456789012345678901234', // > 32 chars
  NODE_AGENT_JWT_SECRET: 'node-agent-jwt-secret-32chars-min',
};

describe('EnvSchema', () => {
  describe('valores válidos', () => {
    it('parsea la configuración mínima válida sin errores', () => {
      const result = EnvSchema.safeParse(BASE);
      expect(result.success).toBe(true);
    });

    it('aplica valores por defecto correctamente', () => {
      const result = EnvSchema.safeParse(BASE);
      if (!result.success) throw new Error(JSON.stringify(result.error.format()));
      const data = result.data;
      expect(data.NODE_ENV).toBe('development');
      expect(data.API_PORT).toBe(3001);
      expect(data.API_HOST).toBe('0.0.0.0');
      expect(data.API_PREFIX).toBe('api/v1');
      expect(data.REDIS_HOST).toBe('127.0.0.1');
      expect(data.REDIS_PORT).toBe(6379);
      expect(data.REDIS_DB).toBe(0);
      expect(data.DATABASE_POOL_MIN).toBe(2);
      expect(data.DATABASE_POOL_MAX).toBe(10);
      expect(data.JWT_ACCESS_EXPIRES_IN).toBe('15m');
      expect(data.JWT_REFRESH_EXPIRES_IN).toBe('7d');
      expect(data.NODE_AGENT_JWT_EXPIRES_IN).toBe('5m');
      expect(data.THROTTLE_TTL_SECONDS).toBe(60);
      expect(data.THROTTLE_LIMIT).toBe(100);
      expect(data.LOG_LEVEL).toBe('info');
    });

    it('coerce API_PORT de string a número', () => {
      const result = EnvSchema.safeParse({ ...BASE, API_PORT: '8080' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.API_PORT).toBe(8080);
    });

    it('transforma API_CORS_ORIGINS en array separado por comas', () => {
      const result = EnvSchema.safeParse({
        ...BASE,
        API_CORS_ORIGINS: 'http://app.example.com,https://admin.example.com',
      });
      expect(result.success).toBe(true);
      if (result.success)
        expect(result.data.API_CORS_ORIGINS).toEqual([
          'http://app.example.com',
          'https://admin.example.com',
        ]);
    });

    it('API_CORS_ORIGINS con un solo origen resulta en array de un elemento', () => {
      const result = EnvSchema.safeParse({
        ...BASE,
        API_CORS_ORIGINS: 'http://localhost:3000',
      });
      expect(result.success).toBe(true);
      if (result.success)
        expect(result.data.API_CORS_ORIGINS).toEqual(['http://localhost:3000']);
    });

    it('acepta REDIS_PASSWORD como opcional (omitido)', () => {
      const result = EnvSchema.safeParse(BASE);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.REDIS_PASSWORD).toBeUndefined();
    });

    it('acepta REDIS_PASSWORD cuando se proporciona', () => {
      const result = EnvSchema.safeParse({ ...BASE, REDIS_PASSWORD: 'redis-secret' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.REDIS_PASSWORD).toBe('redis-secret');
    });

    it('acepta variables mTLS opcionales', () => {
      const result = EnvSchema.safeParse({
        ...BASE,
        NODE_AGENT_MTLS_CERT: '-----BEGIN CERTIFICATE-----',
        NODE_AGENT_MTLS_KEY: '-----BEGIN PRIVATE KEY-----',
        NODE_AGENT_MTLS_CA: '-----BEGIN CERTIFICATE-----',
        MTLS_CA_CERT_PEM: '-----BEGIN CERTIFICATE-----',
        MTLS_CA_KEY_PEM: '-----BEGIN PRIVATE KEY-----',
      });
      expect(result.success).toBe(true);
    });

    it('acepta NODE_ENV: test y production', () => {
      expect(EnvSchema.safeParse({ ...BASE, NODE_ENV: 'test' }).success).toBe(true);
      expect(EnvSchema.safeParse({ ...BASE, NODE_ENV: 'production' }).success).toBe(true);
    });

    it('acepta todos los valores válidos de LOG_LEVEL', () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
      for (const level of levels) {
        const result = EnvSchema.safeParse({ ...BASE, LOG_LEVEL: level });
        expect(result.success).toBe(true);
      }
    });

    it('coerce DATABASE_POOL_MIN y DATABASE_POOL_MAX de string', () => {
      const result = EnvSchema.safeParse({
        ...BASE,
        DATABASE_POOL_MIN: '4',
        DATABASE_POOL_MAX: '20',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DATABASE_POOL_MIN).toBe(4);
        expect(result.data.DATABASE_POOL_MAX).toBe(20);
      }
    });
  });

  describe('validaciones que deben fallar', () => {
    it('falla si DATABASE_URL no es una URL válida', () => {
      const result = EnvSchema.safeParse({ ...BASE, DATABASE_URL: 'not-a-url' });
      expect(result.success).toBe(false);
    });

    it('falla si JWT_ACCESS_SECRET tiene menos de 32 caracteres', () => {
      const result = EnvSchema.safeParse({ ...BASE, JWT_ACCESS_SECRET: 'short-secret' });
      expect(result.success).toBe(false);
    });

    it('falla si JWT_REFRESH_SECRET tiene menos de 32 caracteres', () => {
      const result = EnvSchema.safeParse({ ...BASE, JWT_REFRESH_SECRET: 'too-short' });
      expect(result.success).toBe(false);
    });

    it('falla si NODE_ENV tiene valor no permitido', () => {
      const result = EnvSchema.safeParse({ ...BASE, NODE_ENV: 'staging' });
      expect(result.success).toBe(false);
    });

    it('falla si LOG_LEVEL tiene valor no permitido', () => {
      const result = EnvSchema.safeParse({ ...BASE, LOG_LEVEL: 'verbose' });
      expect(result.success).toBe(false);
    });

    it('falla si API_PORT no puede coercerse a número', () => {
      const result = EnvSchema.safeParse({ ...BASE, API_PORT: 'not-a-number' });
      expect(result.success).toBe(false);
    });

    it('falla si DATABASE_POOL_MAX es 0 (debe ser positivo)', () => {
      const result = EnvSchema.safeParse({ ...BASE, DATABASE_POOL_MAX: 0 });
      expect(result.success).toBe(false);
    });

    it('falla si NODE_AGENT_JWT_SECRET tiene menos de 32 caracteres', () => {
      const result = EnvSchema.safeParse({ ...BASE, NODE_AGENT_JWT_SECRET: 'short' });
      expect(result.success).toBe(false);
    });

    it('falla si faltan variables obligatorias (DATABASE_URL ausente)', () => {
      const { DATABASE_URL: _, ...withoutDb } = BASE;
      const result = EnvSchema.safeParse(withoutDb);
      expect(result.success).toBe(false);
    });
  });
});
