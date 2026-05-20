import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NodeAgentClient, type AgentResponseBody } from './node-agent.client';

const makeOkResponse = (data: Record<string, unknown>): AgentResponseBody => ({
  success: true,
  correlationId: 'corr-1',
  operation: 'health_check',
  nodeId: 'node-1',
  executedAt: new Date().toISOString(),
  durationMs: 5,
  data,
});

describe('NodeAgentClient', () => {
  let client: NodeAgentClient;
  let jwtSign: jest.Mock;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    jwtSign = jest.fn().mockReturnValue('signed-token');

    const config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          NODE_AGENT_BASE_URL: 'https://agent.example.com',
          NODE_AGENT_JWT_SECRET: 'secret',
          NODE_AGENT_JWT_EXPIRES_IN: '5m',
          NODE_AGENT_MTLS_CERT: '',
          NODE_AGENT_MTLS_KEY: '',
          NODE_AGENT_MTLS_CA: '',
        };
        return map[key] ?? '';
      }),
    } as unknown as ConfigService<any, true>;

    const jwtService = { sign: jwtSign } as unknown as JwtService;

    client = new NodeAgentClient(config, jwtService);

    // Mock del fetch global
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(makeOkResponse({ status: 'ok' })),
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('call()', () => {
    it('llama al endpoint correcto y devuelve la respuesta del agente', async () => {
      const result = await client.call('node-1', 'health_check', { deep: false });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://agent.example.com/operations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer signed-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.operation).toBe('health_check');
    });

    it('incluye un correlationId único en el cuerpo de la petición', async () => {
      await client.call('node-1', 'apply_config', { cfg: 'value' });

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('lanza ServiceUnavailableException si fetch falla (red)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(client.call('node-1', 'health_check', {})).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('lanza ServiceUnavailableException si el agente responde con HTTP 500', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      } as unknown as Response);

      await expect(client.call('node-1', 'health_check', {})).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('lanza ServiceUnavailableException si la respuesta indica success=false', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: false,
          correlationId: 'corr-2',
          operation: 'health_check',
          nodeId: 'node-1',
          executedAt: new Date().toISOString(),
          durationMs: 1,
          error: 'Disk full',
        }),
        text: jest.fn().mockResolvedValue(''),
      } as unknown as Response);

      await expect(client.call('node-1', 'health_check', {})).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('healthCheck()', () => {
    it('delega en call() con operación health_check', async () => {
      const callSpy = jest.spyOn(client, 'call').mockResolvedValueOnce(makeOkResponse({}));

      await client.healthCheck('node-1');

      expect(callSpy).toHaveBeenCalledWith('node-1', 'health_check', { deep: false });
    });
  });

  describe('metricsReport()', () => {
    it('delega en call() con operación metrics_report', async () => {
      const callSpy = jest.spyOn(client, 'call').mockResolvedValueOnce(makeOkResponse({}));

      await client.metricsReport('node-1');

      expect(callSpy).toHaveBeenCalledWith('node-1', 'metrics_report', {});
    });
  });

  describe('queueStats()', () => {
    it('delega en call() con operación queue_stats y tenantId opcional', async () => {
      const callSpy = jest.spyOn(client, 'call').mockResolvedValueOnce(makeOkResponse({}));

      await client.queueStats('node-1', 'tenant-1');

      expect(callSpy).toHaveBeenCalledWith('node-1', 'queue_stats', { tenantId: 'tenant-1' });
    });
  });

  describe('backup()', () => {
    it('delega en call() con operación backup_execute y los parámetros correctos', async () => {
      const callSpy = jest.spyOn(client, 'call').mockResolvedValueOnce(makeOkResponse({}));

      await client.backup('node-1', 'full', '/backups', 'tenant-1');

      expect(callSpy).toHaveBeenCalledWith('node-1', 'backup_execute', {
        type: 'full',
        targetPath: '/backups',
        tenantId: 'tenant-1',
      });
    });
  });
});
