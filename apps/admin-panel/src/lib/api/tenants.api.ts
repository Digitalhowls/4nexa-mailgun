import apiClient from '@/lib/api-client';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: string;
  planId: string | null;
  nodeId: string | null;
  plan?: { name: string } | null;
  node?: { name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantListResponse {
  items: Tenant[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateTenantPayload {
  name: string;
  slug: string;
  email: string;
  planId?: string;
}

export interface UpdateTenantPayload extends Partial<CreateTenantPayload> {}

export const tenantsApi = {
  findAll: async (page = 1, pageSize = 20): Promise<TenantListResponse> => {
    const { data } = await apiClient.get('/tenants', { params: { page, pageSize } });
    return data.data;
  },

  findOne: async (id: string): Promise<Tenant> => {
    const { data } = await apiClient.get(`/tenants/${id}`);
    return data.data;
  },

  create: async (payload: CreateTenantPayload): Promise<Tenant> => {
    const { data } = await apiClient.post('/tenants', payload);
    return data.data;
  },

  update: async (id: string, payload: UpdateTenantPayload): Promise<Tenant> => {
    const { data } = await apiClient.patch(`/tenants/${id}`, payload);
    return data.data;
  },

  suspend: async (id: string): Promise<Tenant> => {
    const { data } = await apiClient.post(`/tenants/${id}/suspend`);
    return data.data;
  },

  reactivate: async (id: string): Promise<Tenant> => {
    const { data } = await apiClient.post(`/tenants/${id}/reactivate`);
    return data.data;
  },

  assignNode: async (id: string, nodeId: string): Promise<Tenant> => {
    const { data } = await apiClient.post(`/tenants/${id}/assign-node`, { nodeId });
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/tenants/${id}`);
  },
};
