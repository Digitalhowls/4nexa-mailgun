import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
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
