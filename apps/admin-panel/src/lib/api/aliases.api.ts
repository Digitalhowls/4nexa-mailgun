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

export interface AliasListResponse {
  items: Alias[];
  total: number;
  page: number;
  pageSize: number;
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

export const aliasesApi = {
  findAll: async (page = 1, pageSize = 20, domainId?: string): Promise<AliasListResponse> => {
    const { data } = await apiClient.get('/aliases', {
      params: { page, pageSize, ...(domainId ? { domainId } : {}) },
    });
    return data.data;
  },

  findOne: async (id: string): Promise<Alias> => {
    const { data } = await apiClient.get(`/aliases/${id}`);
    return data.data;
  },

  create: async (payload: CreateAliasPayload): Promise<Alias> => {
    const { data } = await apiClient.post('/aliases', payload);
    return data.data;
  },

  update: async (id: string, payload: UpdateAliasPayload): Promise<Alias> => {
    const { data } = await apiClient.patch(`/aliases/${id}`, payload);
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/aliases/${id}`);
  },
};
