import { Test } from '@nestjs/testing';
import { AiEngineService } from './ai-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../event-bus/event-bus.service';

const mockPrisma = {
  memoryCell: { findMany: jest.fn() },
};
const mockAudit = { log: jest.fn() };
const mockEventBus = { emit: jest.fn() };

describe('AiEngineService', () => {
  let service: AiEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Desactivar feature AI para tests unitarios (no necesita Ollama)
    delete process.env.FEATURE_AI;
    const module = await Test.createTestingModule({
      providers: [
        AiEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventBusService, useValue: mockEventBus },
      ],
    }).compile();
    service = module.get(AiEngineService);
  });

  describe('analyzeAbuse', () => {
    it('retorna CLEAN con confianza 1 si AI Engine desactivado', async () => {
      const result = await service.analyzeAbuse('t1', {
        subject: 'Test', body: 'Hello', fromEmail: 'a@b.com', ip: '1.2.3.4',
      });
      expect(result.verdict).toBe('CLEAN');
      expect(result.confidence).toBe(1);
    });
  });

  describe('classifyMail', () => {
    it('retorna INBOX si AI Engine desactivado', async () => {
      const result = await service.classifyMail({ subject: 'Hi', body: 'body', fromEmail: 'a@b.com' });
      expect(result.category).toBe('INBOX');
      expect(result.confidence).toBe(1);
    });
  });

  describe('diagnoseSupport', () => {
    it('retorna mensaje de desactivado si AI Engine está off', async () => {
      const result = await service.diagnoseSupport('t1', '¿por qué falla mi DKIM?', 'u1');
      expect(result.answer).toContain('desactivado');
    });
  });

  describe('extractInvoiceData', () => {
    it('retorna vacío si AI Engine desactivado', async () => {
      const result = await service.extractInvoiceData('texto de factura');
      expect(result.amount).toBe(0);
    });
  });
});
