export interface Alias {
  id: string;
  tenantId: string;
  domainId: string;
  source: string;
  destination: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
