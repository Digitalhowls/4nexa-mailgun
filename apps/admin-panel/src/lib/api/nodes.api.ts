import apiClient from '@/lib/api-client';

export interface Node {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  status: string;
  maintenance: boolean;
  agentUrl: string;
  region: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NodeListResponse {
  items: Node[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateNodePayload {
  name: string;
  hostname: string;
  ipAddress: string;
  agentUrl: string;
  region?: string;
}

export interface UpdateNodePayload extends Partial<CreateNodePayload> {}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigApplyResult {
  success: boolean;
  nodeId: string;
  appliedAt: string;
  errors: string[];
}

export const nodesApi = {
  findAll: async (page = 1, pageSize = 20): Promise<NodeListResponse> => {
    const { data } = await apiClient.get('/nodes', { params: { page, pageSize } });
    return data.data;
  },

  findOne: async (id: string): Promise<Node> => {
    const { data } = await apiClient.get(`/nodes/${id}`);
    return data.data;
  },

  create: async (payload: CreateNodePayload): Promise<Node> => {
    const { data } = await apiClient.post('/nodes', payload);
    return data.data;
  },

  update: async (id: string, payload: UpdateNodePayload): Promise<Node> => {
    const { data } = await apiClient.patch(`/nodes/${id}`, payload);
    return data.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/nodes/${id}`);
  },

  setMaintenance: async (id: string, maintenance: boolean): Promise<Node> => {
    const { data } = await apiClient.patch(`/nodes/${id}/maintenance`, { maintenance });
    return data.data;
  },

  pushConfig: async (id: string): Promise<ConfigApplyResult> => {
    const { data } = await apiClient.post(`/nodes/${id}/push-config`);
    return data.data;
  },

  validateConfig: async (id: string): Promise<ConfigValidationResult> => {
    const { data } = await apiClient.get(`/nodes/${id}/validate-config`);
    return data.data;
  },
};
