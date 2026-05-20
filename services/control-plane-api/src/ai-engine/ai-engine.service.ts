import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventBusService } from '../event-bus/event-bus.service';
import { FEATURES } from '../config/features.config';

export type AbuseVerdict = 'CLEAN' | 'SPAM' | 'PHISHING' | 'MALWARE';

export interface AbuseAnalysisResult {
  verdict: AbuseVerdict;
  confidence: number;
  reason: string;
}

export interface MailClassificationResult {
  category: 'INBOX' | 'SPAM' | 'PROMOTIONAL' | 'SOCIAL' | 'TRANSACTIONAL' | 'NEWSLETTER';
  confidence: number;
}

export interface SupportDiagnosisResult {
  answer: string;
  confidence: number;
  sources: string[];
}

@Injectable()
export class AiEngineService {
  private readonly log = new Logger(AiEngineService.name);
  private readonly ollamaUrl: string;
  private readonly openAiKey: string | undefined;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventBus: EventBusService,
  ) {
    this.ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.openAiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.AI_MODEL ?? 'llama3';
  }

  /** Análisis de abuso basado en heurísticas + LLM */
  async analyzeAbuse(
    tenantId: string,
    content: { subject: string; body: string; fromEmail: string; ip: string },
  ): Promise<AbuseAnalysisResult> {
    if (!FEATURES.AI_ENGINE) {
      return { verdict: 'CLEAN', confidence: 1, reason: 'AI Engine desactivado' };
    }

    const prompt = this.buildAbusePrompt(content);
    const raw = await this.callLlm(prompt);
    const result = this.parseAbuseResponse(raw);

    if (result.verdict !== 'CLEAN') {
      await this.eventBus.publish({
        type: 'ai.abuse_detected',
        payload: { tenantId, fromEmail: content.fromEmail, verdict: result.verdict },
      } as any);
    }

    return result;
  }

  /** Clasificación de correo entrante */
  async classifyMail(
    content: { subject: string; body: string; fromEmail: string },
  ): Promise<MailClassificationResult> {
    if (!FEATURES.AI_ENGINE) {
      return { category: 'INBOX', confidence: 1 };
    }

    const prompt = `Classify the following email into one of: INBOX, SPAM, PROMOTIONAL, SOCIAL, TRANSACTIONAL, NEWSLETTER.
Subject: ${content.subject}
From: ${content.fromEmail}
Body (first 500 chars): ${content.body.substring(0, 500)}
Respond with JSON: {"category": "...", "confidence": 0.0-1.0}`;

    const raw = await this.callLlm(prompt);

    try {
      const parsed = JSON.parse(raw.trim());
      return { category: parsed.category ?? 'INBOX', confidence: parsed.confidence ?? 0.8 };
    } catch {
      return { category: 'INBOX', confidence: 0.5 };
    }
  }

  /** Asistente de soporte técnico para diagnóstico de entregabilidad */
  async diagnoseSupport(
    tenantId: string,
    question: string,
    userId: string,
  ): Promise<SupportDiagnosisResult> {
    if (!FEATURES.AI_ENGINE) {
      return { answer: 'AI Engine desactivado. Consulte la documentación.', confidence: 1, sources: [] };
    }

    // Recupera contexto de MemoryCell del tenant (embeddings semánticos)
    const memoryCells = await this.prisma.memoryCell.findMany({
      where: { tenantId, scope: 'SUPPORT' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });

    const context = memoryCells.map((c) => JSON.stringify(c.payload)).join('\n---\n');
    const prompt = `You are a mail server support assistant. Use the context below to answer the user question.
Context:
${context}

Question: ${question}
Respond with JSON: {"answer": "...", "confidence": 0.0-1.0, "sources": []}`;

    const raw = await this.callLlm(prompt);

    try {
      const parsed = JSON.parse(raw.trim());
      await this.audit.log({
        tenantId,
        userId,
        action: 'ai.support_query',
        entityType: 'Tenant',
        entityId: tenantId,
        metadata: { question: question.substring(0, 200) },
      });
      return {
        answer: parsed.answer ?? 'Sin respuesta',
        confidence: parsed.confidence ?? 0.5,
        sources: parsed.sources ?? [],
      };
    } catch {
      return { answer: raw.trim(), confidence: 0.5, sources: [] };
    }
  }

  /** Extrae datos de facturas de texto (pdf-parse → LLM) */
  async extractInvoiceData(
    rawText: string,
  ): Promise<{ vendor: string; amount: number; currency: string; date: string }> {
    if (!FEATURES.AI_ENGINE) {
      return { vendor: '', amount: 0, currency: 'EUR', date: '' };
    }

    const prompt = `Extract invoice data from the following text and respond with JSON:
{"vendor": "...", "amount": 0.0, "currency": "EUR", "date": "YYYY-MM-DD"}
Text:
${rawText.substring(0, 2000)}`;

    const raw = await this.callLlm(prompt);
    try {
      return JSON.parse(raw.trim());
    } catch {
      return { vendor: '', amount: 0, currency: 'EUR', date: '' };
    }
  }

  /** Cron: reentrenar/refrescar embeddings en MemoryCell cada 24h */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async refreshEmbeddings(): Promise<void> {
    if (!FEATURES.AI_ENGINE) return;
    this.log.log('Refreshing AI embeddings');
    // En producción: iterar MemoryCells sin embedding, generar con Ollama embeddings API, persistir
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async callLlm(prompt: string): Promise<string> {
    if (this.openAiKey) {
      return this.callOpenAi(prompt);
    }
    return this.callOllama(prompt);
  }

  private async callOllama(prompt: string): Promise<string> {
    const res = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json() as { response: string };
    return data.response;
  }

  private async callOpenAi(prompt: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openAiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json() as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? '';
  }

  private buildAbusePrompt(content: { subject: string; body: string; fromEmail: string; ip: string }): string {
    return `Analyze this email for abuse. Respond with JSON: {"verdict": "CLEAN|SPAM|PHISHING|MALWARE", "confidence": 0.0-1.0, "reason": "..."}
From: ${content.fromEmail} (${content.ip})
Subject: ${content.subject}
Body: ${content.body.substring(0, 1000)}`;
  }

  private parseAbuseResponse(raw: string): AbuseAnalysisResult {
    try {
      const parsed = JSON.parse(raw.trim());
      return {
        verdict: (['CLEAN', 'SPAM', 'PHISHING', 'MALWARE'].includes(parsed.verdict) ? parsed.verdict : 'CLEAN') as AbuseVerdict,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reason: parsed.reason ?? '',
      };
    } catch {
      return { verdict: 'CLEAN', confidence: 0.5, reason: 'parse error' };
    }
  }
}
