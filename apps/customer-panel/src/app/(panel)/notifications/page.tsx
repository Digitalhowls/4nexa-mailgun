'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bell, Plus, Trash2, Loader2, Mail, Webhook, Slack } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  notificationsApi,
  type NotificationType,
  type CreateNotificationChannelPayload,
} from '@/lib/api/notifications.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, formatDate } from '@/lib/utils';

const channelSchema = z.object({
  type: z.enum(['EMAIL', 'WEBHOOK', 'SLACK']),
  name: z.string().min(1, 'Nombre requerido'),
  emailAddress: z.string().email().optional().or(z.literal('')),
  webhookUrl: z.string().url().optional().or(z.literal('')),
  slackWebhookUrl: z.string().url().optional().or(z.literal('')),
});

type ChannelForm = z.infer<typeof channelSchema>;

const TYPE_ICON: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  EMAIL: Mail,
  WEBHOOK: Webhook,
  SLACK: Slack,
};

const TYPE_LABEL: Record<NotificationType, string> = {
  EMAIL: 'Email',
  WEBHOOK: 'Webhook',
  SLACK: 'Slack',
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: channels, isLoading } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => notificationsApi.listChannels(),
  });

  const form = useForm<ChannelForm>({
    resolver: zodResolver(channelSchema),
    defaultValues: { type: 'EMAIL', name: '' },
  });

  const selectedType = form.watch('type');

  const createMutation = useMutation({
    mutationFn: (values: ChannelForm) => {
      const config: Record<string, string> = {};
      if (values.type === 'EMAIL' && values.emailAddress) config.to = values.emailAddress;
      if (values.type === 'WEBHOOK' && values.webhookUrl) config.url = values.webhookUrl;
      if (values.type === 'SLACK' && values.slackWebhookUrl) config.webhookUrl = values.slackWebhookUrl;
      const payload: CreateNotificationChannelPayload = {
        type: values.type,
        name: values.name,
        config,
      };
      return notificationsApi.createChannel(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
      toast({ title: 'Canal creado', variant: 'success' });
      setDialogOpen(false);
      form.reset();
    },
    onError: (err) => toast({ title: 'Error al crear canal', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.deleteChannel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
      toast({ title: 'Canal eliminado', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error al eliminar', description: getErrorMessage(err), variant: 'destructive' }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Notificaciones</h2>
          <p className="text-muted-foreground">
            Canales de alerta para eventos de tu cuenta
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo canal
        </Button>
      </div>

      {/* Lista de canales */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && channels?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Bell className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No tienes canales configurados</p>
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              Crear tu primer canal
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && channels && channels.length > 0 && (
        <div className="space-y-3">
          {channels.map((ch) => {
            const Icon = TYPE_ICON[ch.type];
            return (
              <Card key={ch.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{ch.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {TYPE_LABEL[ch.type]} · Creado {formatDate(ch.createdAt)}
                    </p>
                  </div>
                  <Badge variant={ch.isActive ? 'success' : 'secondary'}>
                    {ch.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(ch.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog crear canal */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) form.reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo canal de notificación</DialogTitle>
            <DialogDescription>
              Configura dónde quieres recibir alertas de tu cuenta
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input {...form.register('name')} placeholder="Mi canal de alertas" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select
                value={selectedType}
                onValueChange={(v) => form.setValue('type', v as NotificationType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="WEBHOOK">Webhook HTTP</SelectItem>
                  <SelectItem value="SLACK">Slack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedType === 'EMAIL' && (
              <div className="space-y-1">
                <Label>Dirección de email</Label>
                <Input
                  type="email"
                  {...form.register('emailAddress')}
                  placeholder="alertas@tudominio.com"
                />
                {form.formState.errors.emailAddress && (
                  <p className="text-xs text-destructive">{form.formState.errors.emailAddress.message}</p>
                )}
              </div>
            )}

            {selectedType === 'WEBHOOK' && (
              <div className="space-y-1">
                <Label>URL del webhook</Label>
                <Input
                  {...form.register('webhookUrl')}
                  placeholder="https://mi-servidor.com/webhook"
                />
                {form.formState.errors.webhookUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.webhookUrl.message}</p>
                )}
              </div>
            )}

            {selectedType === 'SLACK' && (
              <div className="space-y-1">
                <Label>Webhook URL de Slack</Label>
                <Input
                  {...form.register('slackWebhookUrl')}
                  placeholder="https://hooks.slack.com/services/…"
                />
                {form.formState.errors.slackWebhookUrl && (
                  <p className="text-xs text-destructive">{form.formState.errors.slackWebhookUrl.message}</p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear canal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
