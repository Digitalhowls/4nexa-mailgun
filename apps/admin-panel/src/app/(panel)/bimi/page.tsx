'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BadgeCheck, Save, Loader2, Copy, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { bimiApi, type BimiConfigPayload } from '@/lib/api/bimi.api';
import { domainsApi } from '@/lib/api/domains.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

const schema = z.object({
  svgUrl: z.string().url('URL de la imagen SVG requerida'),
  vmcUrl: z.string().url('URL del VMC inválida').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export default function BimiPage() {
  const [selectedDomainId, setSelectedDomainId] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const { data: domainsData } = useQuery({
    queryKey: ['domains', 'all'],
    queryFn: () => domainsApi.findAll(1, 200),
  });

  const { data: bimiConfig, isLoading: loadingConfig, refetch } = useQuery({
    queryKey: ['bimi', selectedDomainId],
    queryFn: () => bimiApi.getConfig(selectedDomainId),
    enabled: Boolean(selectedDomainId),
  });

  const { data: dnsRecord, isLoading: loadingDns, refetch: refetchDns } = useQuery({
    queryKey: ['bimi-dns', selectedDomainId],
    queryFn: () => bimiApi.getDnsRecord(selectedDomainId),
    enabled: Boolean(selectedDomainId),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: bimiConfig
      ? { svgUrl: bimiConfig.svgUrl ?? '', vmcUrl: bimiConfig.vmcUrl ?? '' }
      : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: BimiConfigPayload) => bimiApi.configure(selectedDomainId, payload),
    onSuccess: () => {
      refetch();
      refetchDns();
      toast({ title: 'Configuración BIMI guardada', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const copyDnsRecord = () => {
    if (dnsRecord?.record) {
      navigator.clipboard.writeText(dnsRecord.record);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const onSubmit = (values: FormValues) => {
    saveMutation.mutate({
      svgUrl: values.svgUrl,
      vmcUrl: values.vmcUrl || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">BIMI</h2>
        <p className="text-muted-foreground">
          Brand Indicators for Message Identification — logotipo verificado en clientes de correo
        </p>
      </div>

      {/* Seleccionar dominio */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5" />
            Dominio a configurar
          </CardTitle>
          <CardDescription>Selecciona el dominio para ver o editar su configuración BIMI.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedDomainId}
            onValueChange={(v) => { setSelectedDomainId(v); reset(); }}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Selecciona un dominio…" />
            </SelectTrigger>
            <SelectContent>
              {domainsData?.items.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedDomainId && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Configuración BIMI */}
          <Card>
            <CardHeader>
              <CardTitle>Configuración de imagen</CardTitle>
              <CardDescription>
                El SVG debe cumplir el estándar BIMI (formato cuadrado, colores planos).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingConfig ? (
                <div className="space-y-4">
                  {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label>URL del logo SVG *</Label>
                    <Input {...register('svgUrl')} placeholder="https://cdn.empresa.com/logo-bimi.svg" />
                    {errors.svgUrl && <p className="text-xs text-destructive">{errors.svgUrl.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>
                      URL del VMC{' '}
                      <span className="text-xs text-muted-foreground">(Verified Mark Certificate, opcional)</span>
                    </Label>
                    <Input {...register('vmcUrl')} placeholder="https://cdn.empresa.com/bimi.pem" />
                    {errors.vmcUrl && <p className="text-xs text-destructive">{errors.vmcUrl.message}</p>}
                  </div>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar configuración
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Registro DNS generado */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Registro DNS TXT</CardTitle>
                  <CardDescription>
                    Añade este registro TXT en tu DNS para activar BIMI.
                  </CardDescription>
                </div>
                {dnsRecord && (
                  <Badge variant="success">Generado</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingDns ? (
                <Skeleton className="h-24 w-full" />
              ) : dnsRecord ? (
                <div className="space-y-3">
                  <div className="relative">
                    <pre className="overflow-x-auto rounded bg-muted p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
                      {dnsRecord.record}
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 h-7 w-7"
                      onClick={copyDnsRecord}
                    >
                      {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>Nombre:</strong> <code>{dnsRecord.name}</code></p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Guarda la configuración para generar el registro DNS.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
