import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tenantsApi } from '@/lib/api/tenants.api';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);
const mockPatch = vi.mocked(apiClient.patch);

beforeEach(() => vi.clearAllMocks());

const TENANT = {
  id: 't1',
  name: 'Acme Corp',
  slug: 'acme',
  email: 'admin@acme.com',
  status: 'ACTIVE',
  planId: 'p1',
  nodeId: 'n1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('tenantsApi.findAll()', () => {
  it('llama a GET /tenants con paginación', async () => {
    const response = { items: [TENANT], total: 1, page: 1, pageSize: 20 };
    mockGet.mockResolvedValueOnce({ data: { data: response } });

    const result = await tenantsApi.findAll();

    expect(mockGet).toHaveBeenCalledWith('/tenants', { params: { page: 1, pageSize: 20 } });
    expect(result.items).toHaveLength(1);
  });
});

describe('tenantsApi.findOne()', () => {
  it('llama a GET /tenants/:id', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: TENANT } });
    const result = await tenantsApi.findOne('t1');
    expect(mockGet).toHaveBeenCalledWith('/tenants/t1');
    expect(result.slug).toBe('acme');
  });
});

describe('tenantsApi.create()', () => {
  it('llama a POST /tenants y devuelve el tenant creado', async () => {
    const payload = { name: 'New Co', slug: 'newco', email: 'x@y.com' };
    mockPost.mockResolvedValueOnce({ data: { data: { ...TENANT, ...payload } } });

    const result = await tenantsApi.create(payload);

    expect(mockPost).toHaveBeenCalledWith('/tenants', payload);
    expect(result.name).toBe('New Co');
  });
});

describe('tenantsApi.update()', () => {
  it('llama a PATCH /tenants/:id con el payload parcial', async () => {
    mockPatch.mockResolvedValueOnce({ data: { data: { ...TENANT, name: 'Acme Updated' } } });

    const result = await tenantsApi.update('t1', { name: 'Acme Updated' });

    expect(mockPatch).toHaveBeenCalledWith('/tenants/t1', { name: 'Acme Updated' });
    expect(result.name).toBe('Acme Updated');
  });
});

describe('tenantsApi.suspend()', () => {
  it('llama a POST /tenants/:id/suspend', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { ...TENANT, status: 'SUSPENDED' } } });
    const result = await tenantsApi.suspend('t1');
    expect(mockPost).toHaveBeenCalledWith('/tenants/t1/suspend');
    expect(result.status).toBe('SUSPENDED');
  });
});

describe('tenantsApi.reactivate()', () => {
  it('llama a POST /tenants/:id/reactivate', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { ...TENANT, status: 'ACTIVE' } } });
    const result = await tenantsApi.reactivate('t1');
    expect(mockPost).toHaveBeenCalledWith('/tenants/t1/reactivate');
    expect(result.status).toBe('ACTIVE');
  });
});
