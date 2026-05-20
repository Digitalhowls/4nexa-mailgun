import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aliasesApi } from '@/lib/api/aliases.api';

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
const mockDelete = vi.mocked(apiClient.delete);

beforeEach(() => vi.clearAllMocks());

const ALIAS = {
  id: 'a1',
  localPart: 'info',
  domainId: 'd1',
  tenantId: 't1',
  destinations: ['user@test.com'],
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('aliasesApi.findAll()', () => {
  it('llama a GET /aliases con paginación', async () => {
    const response = { items: [ALIAS], total: 1, page: 1, pageSize: 20 };
    mockGet.mockResolvedValueOnce({ data: { success: true, data: response } });

    const result = await aliasesApi.findAll();

    expect(mockGet).toHaveBeenCalledWith('/aliases', { params: { page: 1, pageSize: 20, domainId: undefined } });
    expect(result.items).toHaveLength(1);
  });

  it('filtra por domainId cuando se pasa', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: { items: [], total: 0, page: 1, pageSize: 20 } } });
    await aliasesApi.findAll(1, 20, 'd1');
    expect(mockGet).toHaveBeenCalledWith('/aliases', { params: { page: 1, pageSize: 20, domainId: 'd1' } });
  });
});

describe('aliasesApi.findOne()', () => {
  it('llama a GET /aliases/:id', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: ALIAS } });
    const result = await aliasesApi.findOne('a1');
    expect(mockGet).toHaveBeenCalledWith('/aliases/a1');
    expect(result.localPart).toBe('info');
  });
});

describe('aliasesApi.create()', () => {
  it('llama a POST /aliases con el payload', async () => {
    const payload = { localPart: 'sales', domainId: 'd1', destinations: ['x@y.com'] };
    mockPost.mockResolvedValueOnce({ data: { success: true, data: { ...ALIAS, ...payload } } });

    const result = await aliasesApi.create(payload);

    expect(mockPost).toHaveBeenCalledWith('/aliases', payload);
    expect(result.localPart).toBe('sales');
  });
});

describe('aliasesApi.update()', () => {
  it('llama a PATCH /aliases/:id con el payload parcial', async () => {
    const update = { active: false };
    mockPatch.mockResolvedValueOnce({ data: { success: true, data: { ...ALIAS, active: false } } });

    const result = await aliasesApi.update('a1', update);

    expect(mockPatch).toHaveBeenCalledWith('/aliases/a1', update);
    expect(result.active).toBe(false);
  });
});

describe('aliasesApi.remove()', () => {
  it('llama a DELETE /aliases/:id', async () => {
    mockDelete.mockResolvedValueOnce({ data: {} });
    await aliasesApi.remove('a1');
    expect(mockDelete).toHaveBeenCalledWith('/aliases/a1');
  });
});
