import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mailboxesApi } from '@/lib/api/mailboxes.api';

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

const MAILBOX = {
  id: 'm1',
  localPart: 'user',
  domainId: 'd1',
  tenantId: 't1',
  status: 'ACTIVE',
  quotaBytes: '5368709120',
  usedBytes: '1024',
  forcePasswordReset: false,
  lastLoginAt: null,
  suspendedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('mailboxesApi.findAll()', () => {
  it('llama a GET /mailboxes con parámetros por defecto', async () => {
    const response = { items: [MAILBOX], total: 1, page: 1, pageSize: 20 };
    mockGet.mockResolvedValueOnce({ data: { data: response } });

    const result = await mailboxesApi.findAll();

    expect(mockGet).toHaveBeenCalledWith('/mailboxes', { params: { page: 1, pageSize: 20 } });
    expect(result.items).toHaveLength(1);
  });

  it('incluye domainId cuando se pasa', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: { items: [], total: 0, page: 1, pageSize: 20 } } });
    await mailboxesApi.findAll(1, 20, 'd1');
    expect(mockGet).toHaveBeenCalledWith('/mailboxes', { params: { page: 1, pageSize: 20, domainId: 'd1' } });
  });
});

describe('mailboxesApi.findOne()', () => {
  it('llama a GET /mailboxes/:id', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: MAILBOX } });
    const result = await mailboxesApi.findOne('m1');
    expect(mockGet).toHaveBeenCalledWith('/mailboxes/m1');
    expect(result.localPart).toBe('user');
  });
});

describe('mailboxesApi.create()', () => {
  it('llama a POST /mailboxes con el payload', async () => {
    const payload = { localPart: 'new', domainId: 'd1', password: 'pass123' };
    mockPost.mockResolvedValueOnce({ data: { data: { ...MAILBOX, localPart: 'new' } } });

    const result = await mailboxesApi.create(payload);

    expect(mockPost).toHaveBeenCalledWith('/mailboxes', payload);
    expect(result.localPart).toBe('new');
  });
});

describe('mailboxesApi.update()', () => {
  it('llama a PATCH /mailboxes/:id', async () => {
    mockPatch.mockResolvedValueOnce({ data: { data: { ...MAILBOX, status: 'SUSPENDED' } } });

    const result = await mailboxesApi.update('m1', { status: 'SUSPENDED' });

    expect(mockPatch).toHaveBeenCalledWith('/mailboxes/m1', { status: 'SUSPENDED' });
    expect(result.status).toBe('SUSPENDED');
  });
});

describe('mailboxesApi.resetPassword()', () => {
  it('llama a POST /mailboxes/:id/reset-password', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });
    await mailboxesApi.resetPassword('m1', 'newPass!');
    expect(mockPost).toHaveBeenCalledWith('/mailboxes/m1/reset-password', { password: 'newPass!' });
  });
});

describe('mailboxesApi.remove()', () => {
  it('llama a DELETE /mailboxes/:id', async () => {
    mockDelete.mockResolvedValueOnce({ data: {} });
    await mailboxesApi.remove('m1');
    expect(mockDelete).toHaveBeenCalledWith('/mailboxes/m1');
  });
});
