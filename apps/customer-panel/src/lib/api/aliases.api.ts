import apiClient from '@/lib/api-client';

export interface Alias {
  id: string;
  localPart: string;
  domainId: string;
  tenantId: string;
  destinations: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAliasPayload {
  localPart: string;
  domainId: string;
  destinations: string[];
}

export interface UpdateAliasPayload {
  destinations?: string[];
  active?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const aliasesApi = {
  findAll: (page = 1, pageSize = 20, domainId?: string) =>
    apiClient
      .get<{ success: boolean; data: PaginatedResponse<Alias> }>('/aliases', { params: { page, pageSize, domainId } })
      .then((r) => r.data.data),

  findOne: (id: string) =>
    apiClient.get<{ success: boolean; data: Alias }>(`/aliases/${id}`).then((r) => r.data.data),

  create: (payload: CreateAliasPayload) =>
    apiClient.post<{ success: boolean; data: Alias }>('/aliases', payload).then((r) => r.data.data),

  update: (id: string, payload: UpdateAliasPayload) =>
    apiClient.patch<{ success: boolean; data: Alias }>(`/aliases/${id}`, payload).then((r) => r.data.data),

  remove: (id: string) =>
    apiClient.delete(`/aliases/${id}`).then((r) => r.data),
};
