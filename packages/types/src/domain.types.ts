// ─── Enums ────────────────────────────────────────────────────────────────────

export enum DomainStatus {
  PENDING_DNS = 'PENDING_DNS',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

export enum DnsRecordStatus {
  UNCHECKED = 'UNCHECKED',
  VALID = 'VALID',
  INVALID = 'INVALID',
  MISSING = 'MISSING',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Domain {
  id: string;
  tenantId: string;
  domain: string;
  status: DomainStatus;
  dkimSelector: string | null;
  dkimPublicKey: string | null;
  dnsVerifiedAt: Date | null;
  mxVerified: boolean;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  reputationScore: number;
  nodeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DnsCheckResult {
  domainId: string;
  domain: string;
  checkedAt: Date;
  mx: DnsRecordCheckItem;
  spf: DnsRecordCheckItem;
  dkim: DnsRecordCheckItem;
  dmarc: DnsRecordCheckItem;
  ptr: DnsRecordCheckItem;
  allPassed: boolean;
}

export interface DnsRecordCheckItem {
  type: string;
  status: DnsRecordStatus;
  expected: string;
  found: string | null;
  message: string | null;
}

export interface DnsInstructions {
  domainId: string;
  domain: string;
  records: DnsInstructionRecord[];
}

export interface DnsInstructionRecord {
  type: 'MX' | 'TXT' | 'CNAME';
  host: string;
  value: string;
  ttl: number;
  description: string;
  required: boolean;
}
