import { NodeAgentCallerAdapter } from './node-agent-caller.adapter';
import { NodeAgentClient } from '../node-agent/node-agent.client';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ApplyConfigPayload, ServiceName } from '@4nexa/config-engine';

const mockCall = jest.fn();
const mockAgentClient = { call: mockCall } as unknown as NodeAgentClient;

describe('NodeAgentCallerAdapter', () => {
  let adapter: NodeAgentCallerAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new NodeAgentCallerAdapter(mockAgentClient);
  });

  // ─── applyConfig() ────────────────────────────────────────────────────────

  describe('applyConfig()', () => {
    it('retorna data cuando la respuesta es success=true con data', async () => {
      const mockResult = { applied: true, services: ['postfix'] };
      mockCall.mockResolvedValue({ success: true, data: mockResult });

      const result = await adapter.applyConfig('node-1', {} as ApplyConfigPayload);

      expect(result).toEqual(mockResult);
      expect(mockCall).toHaveBeenCalledWith('node-1', 'apply_config', {});
    });

    it('lanza ServiceUnavailableException cuando success es false', async () => {
      mockCall.mockResolvedValue({ success: false, error: 'timeout del agente' });

      await expect(adapter.applyConfig('node-2', {} as ApplyConfigPayload))
        .rejects.toThrow(ServiceUnavailableException);
    });

    it('lanza ServiceUnavailableException cuando data es null aunque success sea true', async () => {
      mockCall.mockResolvedValue({ success: true, data: null });

      await expect(adapter.applyConfig('node-3', {} as ApplyConfigPayload))
        .rejects.toThrow(ServiceUnavailableException);
    });

    it('incluye el nodeId y motivo en el mensaje de error', async () => {
      mockCall.mockResolvedValue({ success: false, error: 'nodo no responde' });

      await expect(adapter.applyConfig('node-42', {} as ApplyConfigPayload))
        .rejects.toThrow(/node-42/);
    });
  });

  // ─── reloadService() ─────────────────────────────────────────────────────

  describe('reloadService()', () => {
    it('completa sin error cuando la respuesta es success=true', async () => {
      mockCall.mockResolvedValue({ success: true });

      await expect(
        adapter.reloadService('node-1', 'postfix' as ServiceName),
      ).resolves.toBeUndefined();
    });

    it('lanza ServiceUnavailableException cuando success es false', async () => {
      mockCall.mockResolvedValue({ success: false, error: 'servicio no encontrado' });

      await expect(adapter.reloadService('node-1', 'dovecot' as ServiceName))
        .rejects.toThrow(ServiceUnavailableException);
    });

    it('usa "sin detalles" cuando error no está en la respuesta (cubre línea 47)', async () => {
      mockCall.mockResolvedValue({ success: false });

      await expect(adapter.reloadService('node-1', 'postfix' as ServiceName))
        .rejects.toThrow('sin detalles');
    });

    it('pasa el parámetro service correcto en la llamada', async () => {
      mockCall.mockResolvedValue({ success: true });

      await adapter.reloadService('node-5', 'rspamd' as ServiceName);

      expect(mockCall).toHaveBeenCalledWith(
        'node-5',
        'reload_service',
        expect.objectContaining({ service: 'rspamd', reason: 'config-engine-reload' }),
      );
    });
  });
});
