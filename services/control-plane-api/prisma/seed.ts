import { PrismaClient, UserRole, UserStatus, MemoryCellScope } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // ── Plan básico por defecto ──────────────────────────────────────────────
  await prisma.plan.upsert({
    where: { name: 'Starter' },
    update: {},
    create: {
      name: 'Starter',
      maxDomains: 1,
      maxMailboxes: 5,
      storageTotalBytes: BigInt(5 * 1024 * 1024 * 1024), // 5 GB
      storagePerMailboxBytes: BigInt(1024 * 1024 * 1024), // 1 GB
      outboundDailyLimit: 500,
      antivirusEnabled: false,
      backupRetentionDays: 7,
      priceMonthly: 5.0,
      priceYearly: 50.0,
      active: true,
    },
  });

  await prisma.plan.upsert({
    where: { name: 'Business' },
    update: {},
    create: {
      name: 'Business',
      maxDomains: 5,
      maxMailboxes: 50,
      storageTotalBytes: BigInt(50 * 1024 * 1024 * 1024), // 50 GB
      storagePerMailboxBytes: BigInt(5 * 1024 * 1024 * 1024), // 5 GB
      outboundDailyLimit: 5000,
      antivirusEnabled: true,
      backupRetentionDays: 30,
      priceMonthly: 29.0,
      priceYearly: 290.0,
      active: true,
    },
  });

  await prisma.plan.upsert({
    where: { name: 'Enterprise' },
    update: {},
    create: {
      name: 'Enterprise',
      maxDomains: 50,
      maxMailboxes: 1000,
      storageTotalBytes: BigInt(1024 * 1024 * 1024 * 1024), // 1 TB
      storagePerMailboxBytes: BigInt(20 * 1024 * 1024 * 1024), // 20 GB
      outboundDailyLimit: 100000,
      antivirusEnabled: true,
      backupRetentionDays: 90,
      priceMonthly: 199.0,
      priceYearly: 1990.0,
      active: true,
    },
  });

  // ── Super admin inicial ──────────────────────────────────────────────────
  // La contraseña inicial debe cambiarse en el primer acceso.
  // Por seguridad, se lee de la variable de entorno SEED_ADMIN_PASSWORD.
  const adminPassword = process.env['SEED_ADMIN_PASSWORD'];
  if (!adminPassword) {
    throw new Error('La variable SEED_ADMIN_PASSWORD es obligatoria para el seed.');
  }

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const adminEmail = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@4nexa.io';

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  // ── Platform admin (operaciones diarias, sin acceso a billing/infra) ─────
  const platformAdminEmail =
    process.env['SEED_PLATFORM_ADMIN_EMAIL'] ?? 'ops@4nexa.io';
  const platformAdminPassword = process.env['SEED_PLATFORM_ADMIN_PASSWORD'];

  if (platformAdminPassword) {
    const platformAdminHash = await argon2.hash(platformAdminPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    await prisma.user.upsert({
      where: { email: platformAdminEmail },
      update: {},
      create: {
        email: platformAdminEmail,
        passwordHash: platformAdminHash,
        role: UserRole.PLATFORM_ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`Platform admin: ${platformAdminEmail}`);
  }

  // ── Nodo de correo por defecto (registrado, pendiente de enroll) ────────
  const defaultNodeHostname =
    process.env['SEED_NODE_HOSTNAME'] ?? 'mail1.4nexa.io';
  const defaultNodeIp = process.env['SEED_NODE_IP'] ?? '127.0.0.1';

  await prisma.node.upsert({
    where: { hostname: defaultNodeHostname },
    update: {},
    create: {
      hostname: defaultNodeHostname,
      ipAddress: defaultNodeIp,
      status: 'PENDING',
      warmupStatus: 'COLD',
      reputationScore: 100,
      agentUrl: `https://${defaultNodeHostname}:3099`,
    },
  });

  // ── Celdas iniciales del Brain — configuración operacional por defecto ───
  const brainDefaults: Array<{
    scope: MemoryCellScope;
    key: string;
    payload: Record<string, unknown>;
  }> = [
    {
      scope: MemoryCellScope.OPERATIONAL,
      key: 'system:smtp:max_message_size_bytes',
      payload: { value: 52428800, description: 'Tamaño máximo mensaje SMTP: 50 MB' },
    },
    {
      scope: MemoryCellScope.OPERATIONAL,
      key: 'system:smtp:max_recipients_per_message',
      payload: { value: 100, description: 'Destinatarios máximos por mensaje' },
    },
    {
      scope: MemoryCellScope.OPERATIONAL,
      key: 'system:smtp:max_connections_per_ip',
      payload: { value: 10, description: 'Conexiones SMTP simultáneas por IP' },
    },
    {
      scope: MemoryCellScope.REPUTATION,
      key: 'system:thresholds:bounce_rate_block',
      payload: { value: 0.10, description: 'Tasa de rebotes que activa bloqueo automático (10%)' },
    },
    {
      scope: MemoryCellScope.REPUTATION,
      key: 'system:thresholds:spam_score_reject',
      payload: { value: 8.0, description: 'Puntuación de spam que activa rechazo (Rspamd)' },
    },
    {
      scope: MemoryCellScope.DELIVERABILITY,
      key: 'system:warmup:daily_limits',
      payload: {
        COLD: 50,
        WARMING: 500,
        WARM: null,
        description: 'Límites diarios de envío por fase de calentamiento',
      },
    },
    {
      scope: MemoryCellScope.ABUSE,
      key: 'system:abuse:auto_suspend_threshold',
      payload: {
        spamReports: 5,
        timeWindowHours: 24,
        description: 'Umbral de reportes de spam para suspensión automática',
      },
    },
  ];

  for (const cell of brainDefaults) {
    // Nota: tenantId=null con @@unique en Prisma requiere findFirst + create/update
    // porque PostgreSQL sin NULLS NOT DISTINCT trata NULL != NULL en ON CONFLICT.
    const existing = await prisma.memoryCell.findFirst({
      where: { tenantId: null, scope: cell.scope, key: cell.key },
    });
    if (!existing) {
      await prisma.memoryCell.create({
        data: {
          tenantId: null,
          scope: cell.scope,
          key: cell.key,
          payload: cell.payload,
          createdBy: 'seed',
        },
      });
    }
  }

  console.log(`Seed completado. Usuario admin: ${adminEmail}`);
}

main()
  .catch((e: unknown) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
