import apiClient from '@/lib/api-client';

export interface AbuseAnalysisResult {
  score: number;
  flags: string[];
  recommendation: 'ALLOW' | 'REVIEW' | 'BLOCK';
  details: Record<string, unknown>;
}

export interface MailClassificationResult {
  category: string;
  confidence: number;
  labels: string[];
}

export interface SupportDiagnosisResult {
  issue: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  suggestions: string[];
  rootCause: string | null;
}

export interface InvoiceExtractionResult {
  invoiceNumber: string | null;
  amount: number | null;
  currency: string | null;
  issuer: string | null;
  date: string | null;
  items: { description: string; quantity: number; amount: number }[];
}

export const aiApi = {
  analyzeAbuse: async (tenantId: string, content: string): Promise<AbuseAnalysisResult> => {
    const { data } = await apiClient.post('/ai/abuse/analyze', { tenantId, content });
    return data.data;
  },

  classifyMail: async (subject: string, body: string, from: string): Promise<MailClassificationResult> => {
    const { data } = await apiClient.post('/ai/mail/classify', { subject, body, from });
    return data.data;
  },

  diagnoseSupportIssue: async (description: string, context: Record<string, unknown>): Promise<SupportDiagnosisResult> => {
    const { data } = await apiClient.post('/ai/support/diagnose', { description, context });
    return data.data;
  },

  extractInvoice: async (mailboxId: string, emailId: string): Promise<InvoiceExtractionResult> => {
    const { data } = await apiClient.post('/ai/invoice/extract', { mailboxId, emailId });
    return data.data;
  },
};
