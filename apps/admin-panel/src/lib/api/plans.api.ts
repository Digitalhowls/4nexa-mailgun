import apiClient from '@/lib/api-client';

export interface Plan {
  id: string;
  name: string;
  slug: string;
  maxDomains: number;
  maxMailboxes: number;
  maxAliases: number;
  maxStorageGb: number;
  price: number;
  currency: string;
  isPublic: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanListResponse {
  items: Plan[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreatePlanPayload {
  name: string;
  slug: string;
  maxDomains: number;
  maxMailboxes: number;
  maxAliases: number;
  maxStorageGb: number;
  price: number;
  currency: string;
  isPublic: boolean;
}

export interface UpdatePlanPayload extends Partial<CreatePlanPayload> {
  isActive?: boolean;
}

export const plansApi = {
  findAll: async (page = 1, pageSize = 20): Promise<PlanListResponse> => {
    const { data } = await apiClient.get('/plans', { params: { page, pageSize } });
    return data.data;
  },

  findOne: async (id: string): Promise<Plan> => {
    const { data } = await apiClient.get(`/plans/${id}`);
    return data.data;
  },

  create: async (payload: CreatePlanPayload): Promise<Plan> => {
    const { data } = await apiClient.post('/plans', payload);
    return data.data;
  },

  update: async (id: string, payload: UpdatePlanPayload): Promise<Plan> => {
    const { data } = await apiClient.patch(`/plans/${id}`, payload);
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/plans/${id}`);
  },
};
