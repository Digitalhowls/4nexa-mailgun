export interface Plan {
  id: string;
  name: string;
  maxDomains: number;
  maxMailboxes: number;
  storageTotalBytes: bigint;
  storagePerMailboxBytes: bigint;
  outboundDailyLimit: number;
  antivirusEnabled: boolean;
  backupRetentionDays: number;
  priceMonthly: string; // Decimal as string for safe serialization
  priceYearly: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
