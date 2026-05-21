/**
 * data.factory.ts
 * Genera datos de prueba realistas usando @faker-js/faker.
 */
import { faker } from '@faker-js/faker';

// ─── Tipos de datos ────────────────────────────────────────────────────────

export interface FakeTenant {
  name: string;
  plan: string;
  contactEmail: string;
  maxDomains: number;
  maxMailboxes: number;
}

export interface FakeDomain {
  name: string;
  tenantId: string;
}

export interface FakeMailbox {
  address: string;
  passwordHash: string;
  quotaBytes: number;
  firstName: string;
  lastName: string;
}

export interface FakeCredentials {
  email: string;
  password: string;
}

export interface FakeAntispamPolicy {
  enabled: boolean;
  spamThreshold: number;
  rejectAbove: number;
  greylistEnabled: boolean;
  whitelist: string[];
  blacklist: string[];
}

export interface FakeApiKey {
  name: string;
  permissions: string[];
}

// ─── Fábrica ──────────────────────────────────────────────────────────────

export const factory = {
  /** Crea un tenant falso */
  tenant(overrides: Partial<FakeTenant> = {}): FakeTenant {
    return {
      name: `${faker.company.name()} QA`,
      plan: faker.helpers.arrayElement(['starter', 'business', 'enterprise']),
      contactEmail: faker.internet.email(),
      maxDomains: faker.number.int({ min: 1, max: 10 }),
      maxMailboxes: faker.number.int({ min: 10, max: 500 }),
      ...overrides,
    };
  },

  /** Crea un dominio falso */
  domain(tenantId = 'qa-tenant-001', overrides: Partial<FakeDomain> = {}): FakeDomain {
    const company = faker.company.name().toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
    return {
      name: `${company}-qa.${faker.internet.domainSuffix()}`,
      tenantId,
      ...overrides,
    };
  },

  /** Crea un buzón falso */
  mailbox(domain = 'qa-test.example.com', overrides: Partial<FakeMailbox> = {}): FakeMailbox {
    const firstName = faker.person.firstName().toLowerCase();
    const lastName  = faker.person.lastName().toLowerCase();
    return {
      address:      `${firstName}.${lastName}@${domain}`,
      passwordHash: `{ARGON2ID}$argon2id$v=19$m=65536,t=2,p=1$fakesalt$fakehash`,
      quotaBytes:   faker.helpers.arrayElement([524288000, 1073741824, 2147483648]),
      firstName,
      lastName,
      ...overrides,
    };
  },

  /** Credenciales de login falsas */
  credentials(overrides: Partial<FakeCredentials> = {}): FakeCredentials {
    return {
      email:    faker.internet.email(),
      password: `${faker.internet.password({ length: 10 })}A1!`,
      ...overrides,
    };
  },

  /** Política antispam falsa */
  antispamPolicy(overrides: Partial<FakeAntispamPolicy> = {}): FakeAntispamPolicy {
    return {
      enabled:         true,
      spamThreshold:   faker.number.float({ min: 3, max: 8, fractionDigits: 1 }),
      rejectAbove:     faker.number.float({ min: 10, max: 15, fractionDigits: 1 }),
      greylistEnabled: faker.datatype.boolean(),
      whitelist:       [faker.internet.ip(), faker.internet.ip()],
      blacklist:       [faker.internet.ip()],
      ...overrides,
    };
  },

  /** API key falsa */
  apiKey(overrides: Partial<FakeApiKey> = {}): FakeApiKey {
    return {
      name: `qa-key-${faker.word.adjective()}`,
      permissions: faker.helpers.arrayElements(
        ['read:domains', 'write:domains', 'read:mailboxes', 'write:mailboxes'],
        { min: 1, max: 3 },
      ),
      ...overrides,
    };
  },

  /** UUID v4 */
  uuid: () => faker.string.uuid(),

  /** Email inválido (para tests de validación) */
  invalidEmail: () =>
    faker.helpers.arrayElement(['notanemail', 'missing@', '@nodomain', 'spaces here@test.com', '']),

  /** Password débil (para tests de validación) */
  weakPassword: () =>
    faker.helpers.arrayElement(['123', 'abc', '      ', 'a', '12345678']),
};
