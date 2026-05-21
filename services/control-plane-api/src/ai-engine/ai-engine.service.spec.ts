import { Test } from '@nestjs/testing';
import { AiEngineService } from './ai-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../event-bus/event-bus.service';

// ─── Mock de features.config ─────────────────────────────────────────────────
// FEATURES se evalúa en tiempo de importación — usamos jest.mock con objeto
// mutable y lo mutamos en cada beforeEach via jest.requireMock().

jest.mock('../config/features.config', () => ({
  FEATURES: { AI_ENGINE: false },
}));

function getFeatures() {
  return (jest.requireMock('../config/features.config') as { FEATURES: { AI_ENGINE: boolean } }).FEATURES;
}

const mockMemoryCellFindMany = jest.fn().mockResolvedValue([]);
const mockPrisma = {
  memoryCell: { findMany: mockMemoryCellFindMany },
};
const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockAudit = { log: mockAuditLog };
const mockEventBusPublish = jest.fn().mockResolvedValue(undefined);
const mockEventBus = { publish: mockEventBusPublish };

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function makeOllamaResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({ response: JSON.stringify(body) }),
  };
}

async function buildService() {
  const module = await Test.createTestingModule({
    providers: [
      AiEngineService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: AuditService, useValue: mockAudit },
      { provide: EventBusService, useValue: mockEventBus },
    ],
  }).compile();
  return module.get(AiEngineService);
}

// ─── Suite con AI Engine desactivado ─────────────────────────────────────────

describe('AiEngineService — feature OFF (por defecto)', () => {
  let service: AiEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    getFeatures().AI_ENGINE = false;
    service = await buildService();
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

// ─── Suite con AI Engine activado (mock de Ollama) ────────────────────────────

describe('AiEngineService — feature ON (Ollama mock)', () => {
  let service: AiEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    getFeatures().AI_ENGINE = true;
    delete process.env.OPENAI_API_KEY;
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    service = await buildService();
  });

  afterEach(() => {
    getFeatures().AI_ENGINE = false;
    delete process.env.OLLAMA_BASE_URL;
  });

  describe('analyzeAbuse()', () => {
    it('retorna veredicto SPAM desde la respuesta del LLM', async () => {
      mockFetch.mockResolvedValue(
        makeOllamaResponse({ verdict: 'SPAM', confidence: 0.95, reason: 'bulk sender' }),
      );

      const result = await service.analyzeAbuse('t1', {
        subject: 'Buy now!', body: 'Click here', fromEmail: 'spam@bad.com', ip: '1.2.3.4',
      });

      expect(result.verdict).toBe('SPAM');
      expect(result.confidence).toBe(0.95);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('publica evento cuando veredicto no es CLEAN', async () => {
      mockFetch.mockResolvedValue(
        makeOllamaResponse({ verdict: 'PHISHING', confidence: 0.99, reason: 'fake login' }),
      );

      await service.analyzeAbuse('t1', {
        subject: 'Your account', body: 'Login here', fromEmail: 'phish@bad.com', ip: '2.2.2.2',
      });

      expect(mockEventBusPublish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ai.abuse_detected' }),
      );
    });

    it('retorna CLEAN con confidence 0.5 cuando la respuesta LLM no es JSON válido', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ response: 'not a json at all' }),
      });

      const result = await service.analyzeAbuse('t1', {
        subject: 'Hi', body: 'body', fromEmail: 'a@b.com', ip: '1.1.1.1',
      });

      expect(result.verdict).toBe('CLEAN');
      expect(result.confidence).toBe(0.5);
    });

    it('retorna CLEAN cuando el veredicto LLM tiene valor desconocido', async () => {
      mockFetch.mockResolvedValue(
        makeOllamaResponse({ verdict: 'UNKNOWN_VERDICT', confidence: 0.8, reason: 'no match' }),
      );

      const result = await service.analyzeAbuse('t1', {
        subject: 'Hi', body: 'body', fromEmail: 'a@b.com', ip: '1.1.1.1',
      });

      expect(result.verdict).toBe('CLEAN');
    });

    it('parseAbuseResponse: confidence no es número y reason es null → usa fallbacks', async () => {
      mockFetch.mockResolvedValue(makeOllamaResponse({ verdict: 'SPAM', confidence: 'not-a-number', reason: null }));
      const result = await service.analyzeAbuse('t1', { subject: 's', body: 'b', fromEmail: 'a@b.com', ip: '1.1.1.1' });
      expect(result.confidence).toBe(0.5);
      expect(result.reason).toBe('');
    });
  });

  describe('classifyMail()', () => {
    it('retorna categoría desde la respuesta del LLM', async () => {
      mockFetch.mockResolvedValue(
        makeOllamaResponse({ category: 'PROMOTIONAL', confidence: 0.87 }),
      );

      const result = await service.classifyMail({
        subject: '50% off today!', body: 'Sale', fromEmail: 'promo@shop.com',
      });

      expect(result.category).toBe('PROMOTIONAL');
      expect(result.confidence).toBe(0.87);
    });

    it('retorna INBOX con confidence 0.5 cuando la respuesta no es JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ response: 'INBOX' }),
      });

      const result = await service.classifyMail({
        subject: 'Hi', body: 'test', fromEmail: 'a@b.com',
      });

      expect(result.category).toBe('INBOX');
    });

    it('usa fallbacks ?? cuando la respuesta JSON omite category y confidence', async () => {
      mockFetch.mockResolvedValue(makeOllamaResponse({}));
      const result = await service.classifyMail({ subject: 'Hi', body: 'body', fromEmail: 'a@b.com' });
      expect(result.category).toBe('INBOX');
      expect(result.confidence).toBe(0.8);
    });
  });

  describe('diagnoseSupport()', () => {
    it('retorna respuesta del LLM con contexto de MemoryCells', async () => {
      mockMemoryCellFindMany.mockResolvedValue([
        { payload: { info: 'DKIM must be configured' }, updatedAt: new Date() },
      ]);
      mockFetch.mockResolvedValue(
        makeOllamaResponse({ answer: 'Configure DKIM selector', confidence: 0.9, sources: [] }),
      );

      const result = await service.diagnoseSupport('t1', '¿cómo configuro DKIM?', 'u1');

      expect(result.answer).toBe('Configure DKIM selector');
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ai.support_query' }),
      );
    });

    it('retorna raw text cuando la respuesta no es JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ response: 'Check your DNS records' }),
      });

      const result = await service.diagnoseSupport('t1', 'question', 'u1');

      expect(result.answer).toBe('Check your DNS records');
      expect(result.confidence).toBe(0.5);
    });

    it('usa fallbacks ?? cuando la respuesta JSON omite confidence y sources', async () => {
      mockFetch.mockResolvedValue(makeOllamaResponse({ answer: 'Solo la respuesta' }));
      const result = await service.diagnoseSupport('t1', 'pregunta', 'u1');
      expect(result.answer).toBe('Solo la respuesta');
      expect(result.confidence).toBe(0.5);
      expect(result.sources).toEqual([]);
    });

    it('usa "Sin respuesta" cuando la respuesta JSON omite answer (cubre línea 129)', async () => {
      mockFetch.mockResolvedValue(makeOllamaResponse({ confidence: 0.9, sources: ['doc1'] }));
      const result = await service.diagnoseSupport('t1', 'pregunta', 'u1');
      expect(result.answer).toBe('Sin respuesta');
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('extractInvoiceData()', () => {
    it('retorna datos de factura desde la respuesta del LLM', async () => {
      mockFetch.mockResolvedValue(
        makeOllamaResponse({ vendor: 'Acme Corp', amount: 299.99, currency: 'EUR', date: '2026-05-20' }),
      );

      const result = await service.extractInvoiceData('Factura Acme Corp 299.99 EUR 2026-05-20');

      expect(result.vendor).toBe('Acme Corp');
      expect(result.amount).toBe(299.99);
      expect(result.currency).toBe('EUR');
    });

    it('retorna valores vacíos cuando la respuesta no es JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ response: 'cannot parse invoice' }),
      });

      const result = await service.extractInvoiceData('texto sin estructura');

      expect(result.amount).toBe(0);
      expect(result.currency).toBe('EUR');
    });
  });
});

// ─── Suite: callLlm via OpenAI ───────────────────────────────────────────────

describe('AiEngineService — OpenAI path', () => {
  let service: AiEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    getFeatures().AI_ENGINE = true;
    process.env.OPENAI_API_KEY = 'sk-test-key';
    service = await buildService();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('usa OpenAI cuando OPENAI_API_KEY está configurado', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ verdict: 'CLEAN', confidence: 0.99, reason: 'ok' }) } }],
      }),
    });

    const result = await service.analyzeAbuse('t1', {
      subject: 'hello', body: 'world', fromEmail: 'a@b.com', ip: '1.2.3.4',
    });

    expect(result.verdict).toBe('CLEAN');
    // Verifica que se llamó a la URL de OpenAI
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('lanza error cuando la respuesta de OpenAI no es ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
    });

    await expect(
      service.analyzeAbuse('t1', { subject: 's', body: 'b', fromEmail: 'x@y.com', ip: '1.1.1.1' }),
    ).rejects.toThrow('OpenAI error: 429');
  });

  it('retorna CLEAN cuando choices[0].message.content es undefined (rama ?? "")', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ choices: [{ message: {} }] }),
    });
    const result = await service.analyzeAbuse('t1', { subject: 's', body: 'b', fromEmail: 'a@b.com', ip: '1.1.1.1' });
    // content undefined → ?? '' → parse falla → verdict CLEAN
    expect(result.verdict).toBe('CLEAN');
  });
});

// ─── Suite: errores de Ollama ─────────────────────────────────────────────────

describe('AiEngineService — Ollama error paths', () => {
  let service: AiEngineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    getFeatures().AI_ENGINE = true;
    service = await buildService();
  });

  it('lanza error cuando Ollama devuelve !res.ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(
      service.analyzeAbuse('t1', { subject: 's', body: 'b', fromEmail: 'a@b.com', ip: '1.2.3.4' }),
    ).rejects.toThrow('Ollama error: 503');
  });
});

// ─── Suite: refreshEmbeddings ─────────────────────────────────────────────────

describe('AiEngineService — refreshEmbeddings()', () => {
  it('no hace nada cuando AI_ENGINE está desactivado', async () => {
    jest.clearAllMocks();
    getFeatures().AI_ENGINE = false;
    const svc = await buildService();

    await expect(svc.refreshEmbeddings()).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('ejecuta sin error cuando AI_ENGINE está activado', async () => {
    jest.clearAllMocks();
    getFeatures().AI_ENGINE = true;
    const svc = await buildService();

    await expect(svc.refreshEmbeddings()).resolves.toBeUndefined();
  });
});
