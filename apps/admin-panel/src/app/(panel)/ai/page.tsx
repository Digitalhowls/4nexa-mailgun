'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Sparkles, Loader2, AlertOctagon, Mail, HeadphonesIcon, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { aiApi } from '@/lib/api/ai.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

/* ─── Schemas ──────────────────────────────────────────────────────────── */

const abuseSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID requerido'),
  content: z.string().min(20, 'Proporciona al menos 20 caracteres de contenido'),
});

const classifySchema = z.object({
  subject: z.string().min(1, 'Asunto requerido'),
  body: z.string().min(10, 'Cuerpo requerido'),
  from: z.string().email('Email del remitente inválido'),
});

const diagnoseSchema = z.object({
  description: z.string().min(10, 'Describe el problema'),
  context: z.string().optional(),
});

const invoiceSchema = z.object({
  mailboxId: z.string().uuid('UUID de buzón requerido'),
  emailId: z.string().min(1, 'ID de email requerido'),
});

type AbuseForm = z.infer<typeof abuseSchema>;
type ClassifyForm = z.infer<typeof classifySchema>;
type DiagnoseForm = z.infer<typeof diagnoseSchema>;
type InvoiceForm = z.infer<typeof invoiceSchema>;

/* ─── Badge de score ──────────────────────────────────────────────────── */

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 70 ? 'destructive' : score >= 40 ? 'warning' : 'success';
  return <Badge variant={variant}>Score: {score}</Badge>;
}

/* ─── Resultado genérico ──────────────────────────────────────────────── */

function ResultBlock({ data }: { data: unknown }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded bg-muted p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

/* ─── Página ──────────────────────────────────────────────────────────── */

export default function AiPage() {
  const [abuseResult, setAbuseResult] = useState<unknown>(null);
  const [classifyResult, setClassifyResult] = useState<unknown>(null);
  const [diagnoseResult, setDiagnoseResult] = useState<unknown>(null);
  const [invoiceResult, setInvoiceResult] = useState<unknown>(null);

  /* Abuse */
  const abuseForm = useForm<AbuseForm>({ resolver: zodResolver(abuseSchema) });
  const abuseMutation = useMutation({
    mutationFn: ({ tenantId, content }: AbuseForm) => aiApi.analyzeAbuse(tenantId, content),
    onSuccess: (data) => setAbuseResult(data),
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  /* Classify */
  const classifyForm = useForm<ClassifyForm>({ resolver: zodResolver(classifySchema) });
  const classifyMutation = useMutation({
    mutationFn: ({ subject, body, from }: ClassifyForm) => aiApi.classifyMail(subject, body, from),
    onSuccess: (data) => setClassifyResult(data),
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  /* Diagnose */
  const diagnoseForm = useForm<DiagnoseForm>({ resolver: zodResolver(diagnoseSchema) });
  const diagnoseMutation = useMutation({
    mutationFn: ({ description, context }: DiagnoseForm) =>
      aiApi.diagnoseSupportIssue(description, context),
    onSuccess: (data) => setDiagnoseResult(data),
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  /* Invoice */
  const invoiceForm = useForm<InvoiceForm>({ resolver: zodResolver(invoiceSchema) });
  const invoiceMutation = useMutation({
    mutationFn: ({ mailboxId, emailId }: InvoiceForm) => aiApi.extractInvoice(mailboxId, emailId),
    onSuccess: (data) => setInvoiceResult(data),
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Engine</h2>
        <p className="text-muted-foreground">
          Análisis de abuso, clasificación de correo, diagnóstico de soporte y extracción de facturas
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Análisis de abuso */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-red-500" />
              Análisis de abuso
            </CardTitle>
            <CardDescription>Analiza contenido sospechoso y obtén un score de riesgo.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={abuseForm.handleSubmit((v) => abuseMutation.mutate(v))}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label>Tenant ID</Label>
                <Input {...abuseForm.register('tenantId')} placeholder="UUID del tenant" className="font-mono text-sm" />
                {abuseForm.formState.errors.tenantId && (
                  <p className="text-xs text-destructive">{abuseForm.formState.errors.tenantId.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Contenido del mensaje</Label>
                <textarea
                  {...abuseForm.register('content')}
                  rows={4}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none font-mono"
                  placeholder="Pega aquí el cuerpo del email sospechoso…"
                />
                {abuseForm.formState.errors.content && (
                  <p className="text-xs text-destructive">{abuseForm.formState.errors.content.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={abuseMutation.isPending}>
                {abuseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Analizar
              </Button>
            </form>
            {abuseMutation.isPending && <Skeleton className="mt-4 h-24 w-full" />}
            {abuseResult && (
              <>
                <Separator className="mt-4" />
                {typeof abuseResult === 'object' && abuseResult !== null && 'score' in abuseResult && (
                  <div className="mt-2 flex items-center gap-2">
                    <ScoreBadge score={(abuseResult as { score: number }).score} />
                    {'recommendation' in abuseResult && (
                      <span className="text-sm">{(abuseResult as { recommendation: string }).recommendation}</span>
                    )}
                  </div>
                )}
                <ResultBlock data={abuseResult} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Clasificación de email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-500" />
              Clasificación de email
            </CardTitle>
            <CardDescription>Determina si un email es spam, phishing, transaccional, etc.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={classifyForm.handleSubmit((v) => classifyMutation.mutate(v))}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label>Remitente (from)</Label>
                <Input {...classifyForm.register('from')} type="email" placeholder="sender@example.com" />
                {classifyForm.formState.errors.from && (
                  <p className="text-xs text-destructive">{classifyForm.formState.errors.from.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Asunto</Label>
                <Input {...classifyForm.register('subject')} placeholder="Asunto del email" />
              </div>
              <div className="space-y-1">
                <Label>Cuerpo</Label>
                <textarea
                  {...classifyForm.register('body')}
                  rows={4}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  placeholder="Contenido del email…"
                />
              </div>
              <Button type="submit" className="w-full" disabled={classifyMutation.isPending}>
                {classifyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Clasificar
              </Button>
            </form>
            {classifyResult && (
              <>
                <Separator className="mt-4" />
                {typeof classifyResult === 'object' && classifyResult !== null && 'category' in classifyResult && (
                  <div className="mt-2">
                    <Badge variant="outline" className="text-sm">
                      {(classifyResult as { category: string }).category}
                    </Badge>
                  </div>
                )}
                <ResultBlock data={classifyResult} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Diagnóstico de soporte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeadphonesIcon className="h-5 w-5 text-purple-500" />
              Diagnóstico de soporte
            </CardTitle>
            <CardDescription>Obtén un diagnóstico automático para incidencias de entrega.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={diagnoseForm.handleSubmit((v) => diagnoseMutation.mutate(v))}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label>Descripción del problema *</Label>
                <textarea
                  {...diagnoseForm.register('description')}
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  placeholder="El cliente no recibe correos desde hace 2 horas…"
                />
                {diagnoseForm.formState.errors.description && (
                  <p className="text-xs text-destructive">{diagnoseForm.formState.errors.description.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Contexto adicional <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input {...diagnoseForm.register('context')} placeholder="Dominio, tenant ID, error específico…" />
              </div>
              <Button type="submit" className="w-full" disabled={diagnoseMutation.isPending}>
                {diagnoseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Diagnosticar
              </Button>
            </form>
            {diagnoseResult && (
              <>
                <Separator className="mt-4" />
                <ResultBlock data={diagnoseResult} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Extracción de facturas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-600" />
              Extracción de facturas
            </CardTitle>
            <CardDescription>Extrae datos estructurados (importe, proveedor, fecha) de facturas adjuntas.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={invoiceForm.handleSubmit((v) => invoiceMutation.mutate(v))}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label>ID del buzón (UUID)</Label>
                <Input {...invoiceForm.register('mailboxId')} placeholder="UUID del buzón" className="font-mono text-sm" />
                {invoiceForm.formState.errors.mailboxId && (
                  <p className="text-xs text-destructive">{invoiceForm.formState.errors.mailboxId.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>ID del email</Label>
                <Input {...invoiceForm.register('emailId')} placeholder="ID del mensaje" className="font-mono text-sm" />
                {invoiceForm.formState.errors.emailId && (
                  <p className="text-xs text-destructive">{invoiceForm.formState.errors.emailId.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={invoiceMutation.isPending}>
                {invoiceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Extraer factura
              </Button>
            </form>
            {invoiceResult && (
              <>
                <Separator className="mt-4" />
                <ResultBlock data={invoiceResult} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
