import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mailboxesApi } from '@/lib/api/mailboxes.api';

vi.mock('@/lib/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import apiClient from '@/lib/api-client';

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);

beforeEach(() => vi.clearAllMocks());

const MAILBOX = {
  id: 'm1',
  localPart: 'maria',
  domainId: 'd1',
  tenantId: 't1',
  status: 'ACTIVE',
  quotaBytes: '5368709120',
  usedBytes: '2048',
  forcePasswordReset: false,
  lastLoginAt: null,
  suspendedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('mailboxesApi.findAll()', () => {
  it('llama a GET /mailboxes con paginación por defecto', async () => {
    const response = { items: [MAILBOX], total: 1, page: 1, pageSize: 20 };
    mockGet.mockResolvedValueOnce({ data: { success: true, data: response } });

    const result = await mailboxesApi.findAll();

    expect(mockGet).toHaveBeenCalledWith('/mailboxes', { params: { page: 1, pageSize: 20, domainId: undefined } });
    expect(result.items[0].localPart).toBe('maria');
  });

  it('pasa domainId cuando se proporciona', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: { items: [], total: 0, page: 1, pageSize: 20 } } });
    await mailboxesApi.findAll(1, 20, 'd1');
    expect(mockGet).toHaveBeenCalledWith('/mailboxes', { params: { page: 1, pageSize: 20, domainId: 'd1' } });
  });
});

describe('mailboxesApi.findOne()', () => {
  it('llama a GET /mailboxes/:id', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: MAILBOX } });
    const result = await mailboxesApi.findOne('m1');
    expect(mockGet).toHaveBeenCalledWith('/mailboxes/m1');
    expect(result.id).toBe('m1');
  });
});

describe('mailboxesApi.resetPassword()', () => {
  it('llama a POST /mailboxes/:id/reset-password', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });
    await mailboxesApi.resetPassword('m1', 'NuevaPass1!');
    expect(mockPost).toHaveBeenCalledWith('/mailboxes/m1/reset-password', { password: 'NuevaPass1!' });
  });
});
