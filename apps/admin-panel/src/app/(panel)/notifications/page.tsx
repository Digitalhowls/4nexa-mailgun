'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Bell, Plus, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { notificationsApi, type CreateChannelPayload, type NotificationType } from '@/lib/api/notifications.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, formatDate } from '@/lib/utils';

const CHANNEL_TYPES: { value: NotificationType; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'WEBHOOK', label: 'Webhook (HTTP)' },
  { value: 'SLACK', label: 'Slack' },
  { value: 'TEAMS', label: 'Microsoft Teams' },
  { value: 'SMS', label: 'SMS' },
];

const CONFIG_FIELDS: Record<NotificationType, { key: string; label: string; placeholder: string; type?: string }[]> = {
  EMAIL: [
    { key: 'to', label: 'Destinatario', placeholder: 'alertas@empresa.com', type: 'email' },
  ],
  WEBHOOK: [
    { key: 'url', label: 'URL del webhook', placeholder: 'https://hook.empresa.com/alert' },
    { key: 'secret', label: 'Secret (HMAC)', placeholder: 'opcional', type: 'password' },
  ],
  SLACK: [
    { key: 'webhookUrl', label: 'Slack webhook URL', placeholder: 'https://hooks.slack.com/services/...' },
    { key: 'channel', label: 'Canal', placeholder: '#alertas' },
  ],
  TEAMS: [
    { key: 'webhookUrl', label: 'Teams webhook URL', placeholder: 'https://outlook.office.com/webhook/...' },
  ],
  SMS: [
    { key: 'phone', label: 'Número de teléfono', placeholder: '+34600000000' },
    { key: 'provider', label: 'Proveedor', placeholder: 'twilio' },
  ],
};

const schema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  type: z.enum(['EMAIL', 'WEBHOOK', 'SLACK', 'TEAMS', 'SMS'] as const),
  config: z.record(z.string()),
});

type FormValues = z.infer<typeof schema>;

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<NotificationType>('EMAIL');

  const { data: channels, isLoading } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => notificationsApi.list(),
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: 'EMAIL', config: {} },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateChannelPayload) => notificationsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
      toast({ title: 'Canal creado', variant: 'success' });
      setDialogOpen(false);
      reset();
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
      toast({ title: 'Canal eliminado' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({ name: values.name, type: values.type, config: values.config });
  };

  const fields = CONFIG_FIELDS[selectedType];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Canales de notificación</h2>
          <p className="text-muted-foreground">
            Alertas por email, Slack, Teams, webhook y SMS ({channels?.length ?? 0} configurados)
          </p>
        </div>
        <Button onClick={() => { reset(); setSelectedType('EMAIL'); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo canal
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Canales activos
          </CardTitle>
          <CardDescription>Lista de canales de notificación configurados para este tenant.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="w-[80px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isLoading && (!channels || channels.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No hay canales de notificación configurados.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && channels?.map((ch) => (
                <TableRow key={ch.id}>
                  <TableCell className="font-medium">{ch.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ch.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ch.isActive ? 'success' : 'secondary'}>
                      {ch.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(ch.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(ch.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog nuevo canal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo canal de notificación</DialogTitle>
            <DialogDescription>Configura un canal para recibir alertas de la plataforma.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre del canal *</Label>
              <Input {...register('name')} placeholder="Alertas críticas Slack" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      setSelectedType(v as NotificationType);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNEL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {fields.map((f) => (
              <div key={f.key} className="space-y-2">
                <Label>{f.label}</Label>
                <Input
                  {...register(`config.${f.key}`)}
                  type={f.type ?? 'text'}
                  placeholder={f.placeholder}
                />
              </div>
            ))}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
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
