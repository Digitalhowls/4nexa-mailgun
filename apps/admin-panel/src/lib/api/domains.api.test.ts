import { describe, it, expect, vi, beforeEach } from 'vitest';
import { domainsApi } from '@/lib/api/domains.api';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);
const mockDelete = vi.mocked(apiClient.delete);

beforeEach(() => vi.clearAllMocks());

const DOMAIN = {
  id: 'd1',
  domain: 'mail.test.com',
  tenantId: 't1',
  nodeId: null,
  status: 'ACTIVE',
  dkimPublicKey: null,
  spfRecord: null,
  dmarcRecord: null,
  mxRecord: null,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('domainsApi.findAll()', () => {
  it('llama a GET /domains con paginación por defecto', async () => {
    const response = { items: [DOMAIN], total: 1, page: 1, pageSize: 20 };
    mockGet.mockResolvedValueOnce({ data: { data: response } });

    const result = await domainsApi.findAll();

    expect(mockGet).toHaveBeenCalledWith('/domains', { params: { page: 1, pageSize: 20 } });
    expect(result).toEqual(response);
  });

  it('incluye tenantId cuando se pasa', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: { items: [], total: 0, page: 1, pageSize: 20 } } });
    await domainsApi.findAll(2, 10, 't1');
    expect(mockGet).toHaveBeenCalledWith('/domains', { params: { page: 2, pageSize: 10, tenantId: 't1' } });
  });
});

describe('domainsApi.findOne()', () => {
  it('llama a GET /domains/:id', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: DOMAIN } });
    const result = await domainsApi.findOne('d1');
    expect(mockGet).toHaveBeenCalledWith('/domains/d1');
    expect(result).toEqual(DOMAIN);
  });
});

describe('domainsApi.create()', () => {
  it('llama a POST /domains con el payload', async () => {
    const payload = { domain: 'new.com', tenantId: 't1', nodeId: 'n1' };
    mockPost.mockResolvedValueOnce({ data: { data: { ...DOMAIN, ...payload } } });

    const result = await domainsApi.create(payload);

    expect(mockPost).toHaveBeenCalledWith('/domains', payload);
    expect(result.domain).toBe('new.com');
  });
});

describe('domainsApi.verifyDns()', () => {
  it('llama a POST /domains/:id/verify y devuelve DnsStatus', async () => {
    const dnsStatus = {
      mx: { valid: true, records: ['mx.test.com'] },
      spf: { valid: false, record: null },
      dkim: { valid: true, record: 'v=DKIM1;...' },
      dmarc: { valid: true, record: 'v=DMARC1;...' },
    };
    mockPost.mockResolvedValueOnce({ data: { data: dnsStatus } });

    const result = await domainsApi.verifyDns('d1');

    expect(mockPost).toHaveBeenCalledWith('/domains/d1/verify');
    expect(result).toEqual(dnsStatus);
  });
});

describe('domainsApi.remove()', () => {
  it('llama a DELETE /domains/:id', async () => {
    mockDelete.mockResolvedValueOnce({ data: {} });
    await domainsApi.remove('d1');
    expect(mockDelete).toHaveBeenCalledWith('/domains/d1');
  });
});
