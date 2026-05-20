'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BarChart3, RefreshCw, Loader2, Webhook, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { orizonApi } from '@/lib/api/orizon.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

const syncSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID requerido'),
});

const webhookSchema = z.object({
  event: z.string().min(1, 'Tipo de evento requerido'),
  data: z.string().min(2, 'JSON del payload requerido'),
});

type SyncForm = z.infer<typeof syncSchema>;
type WebhookForm = z.infer<typeof webhookSchema>;

interface SyncResult {
  syncedMailboxes?: number;
  totalEmails?: number;
  status?: string;
  duration?: number;
}

export default function OrizonPage() {
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [webhookResult, setWebhookResult] = useState<unknown>(null);

  const syncForm = useForm<SyncForm>({ resolver: zodResolver(syncSchema) });
  const webhookForm = useForm<WebhookForm>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      event: 'mailbox.created',
      data: '{\n  "mailboxId": "uuid-here"\n}',
    },
  });

  const syncMutation = useMutation({
    mutationFn: ({ tenantId }: SyncForm) => orizonApi.sync(tenantId),
    onSuccess: (data: SyncResult) => {
      setSyncResult(data);
      toast({ title: 'Sincronización completada', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error en sincronización', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const webhookMutation = useMutation({
    mutationFn: ({ event, data }: WebhookForm) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        throw new Error('JSON del payload inválido');
      }
      return orizonApi.sendWebhook({ event, data: parsed });
    },
    onSuccess: (data) => {
      setWebhookResult(data);
      toast({ title: 'Webhook enviado', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">ORIZON</h2>
        <p className="text-muted-foreground">
          Motor de sincronización y webhooks de la plataforma
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sincronización */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-500" />
              Sincronización de tenant
            </CardTitle>
            <CardDescription>
              Sincroniza los buzones y datos de un tenant con el motor ORIZON.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={syncForm.handleSubmit((v) => syncMutation.mutate(v))}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label>Tenant ID</Label>
                <Input
                  {...syncForm.register('tenantId')}
                  placeholder="UUID del tenant"
                  className="font-mono text-sm"
                />
                {syncForm.formState.errors.tenantId && (
                  <p className="text-xs text-destructive">{syncForm.formState.errors.tenantId.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={syncMutation.isPending}>
                {syncMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sincronizar ORIZON
              </Button>
            </form>

            {syncResult && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {syncResult.status === 'OK' || syncResult.status === 'success' ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-500" />
                    )}
                    <Badge variant={syncResult.status === 'OK' || syncResult.status === 'success' ? 'success' : 'secondary'}>
                      {syncResult.status ?? 'completado'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {syncResult.syncedMailboxes !== undefined && (
                      <div className="rounded-lg bg-muted p-3 text-center">
                        <p className="text-2xl font-bold">{syncResult.syncedMailboxes}</p>
                        <p className="text-xs text-muted-foreground">Buzones sincronizados</p>
                      </div>
                    )}
                    {syncResult.totalEmails !== undefined && (
                      <div className="rounded-lg bg-muted p-3 text-center">
                        <p className="text-2xl font-bold">{syncResult.totalEmails.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Emails procesados</p>
                      </div>
                    )}
                  </div>
                  {syncResult.duration !== undefined && (
                    <p className="text-xs text-muted-foreground text-right">
                      Duración: {syncResult.duration}ms
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Envío de webhook */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-purple-500" />
              Enviar webhook
            </CardTitle>
            <CardDescription>
              Dispara un evento webhook manualmente para pruebas o integraciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={webhookForm.handleSubmit((v) => webhookMutation.mutate(v))}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label>Tipo de evento</Label>
                <Input {...webhookForm.register('event')} placeholder="mailbox.created" className="font-mono text-sm" />
                {webhookForm.formState.errors.event && (
                  <p className="text-xs text-destructive">{webhookForm.formState.errors.event.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Payload (JSON)</Label>
                <textarea
                  {...webhookForm.register('data')}
                  rows={6}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none font-mono"
                />
                {webhookForm.formState.errors.data && (
                  <p className="text-xs text-destructive">{webhookForm.formState.errors.data.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={webhookMutation.isPending}>
                {webhookMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Webhook className="mr-2 h-4 w-4" />
                )}
                Enviar webhook
              </Button>
            </form>

            {webhookResult && (
              <>
                <Separator />
                <pre className="overflow-x-auto rounded bg-muted p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
                  {JSON.stringify(webhookResult, null, 2)}
                </pre>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Acerca de ORIZON
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            ORIZON es el motor de sincronización interna de la plataforma 4nexa. Se encarga de
            mantener la coherencia entre el estado de los buzones, los metadatos de mensajes y
            los sistemas externos suscritos a eventos.
          </p>
          <p>
            Los webhooks son firmados con HMAC-SHA256. El endpoint de recepción debe
            verificar la cabecera <code className="rounded bg-muted-foreground/20 px-1">X-Orizon-Signature</code> antes de procesar el evento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
