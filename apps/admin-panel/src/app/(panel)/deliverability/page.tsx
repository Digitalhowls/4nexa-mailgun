'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Search,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Gauge,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { deliverabilityApi } from '@/lib/api/deliverability.api';
import { domainsApi } from '@/lib/api/domains.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

const checkSchema = z.object({
  estimatedVolume: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
});
type CheckForm = z.infer<typeof checkSchema>;

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 80 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-destructive';
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-bold text-lg ${color}`}>{score}</p>
    </div>
  );
}

export default function DeliverabilityPage() {
  const [searchDomain, setSearchDomain] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [checkDialogOpen, setCheckDialogOpen] = useState(false);

  const { data: domainsData, isLoading: loadingDomains } = useQuery({
    queryKey: ['domains-deliverability', 1, 100],
    queryFn: () => domainsApi.findAll(1, 100),
  });

  const { data: governance, isLoading: loadingGovernance } = useQuery({
    queryKey: ['deliverability-governance', selectedDomainId],
    queryFn: () => deliverabilityApi.getDomainGovernance(selectedDomainId!),
    enabled: !!selectedDomainId,
  });

  const checkForm = useForm<CheckForm>({ resolver: zodResolver(checkSchema) });

  const checkMutation = useMutation({
    mutationFn: (vals: CheckForm) =>
      deliverabilityApi.checkSendPermission(
        selectedDomainId!,
        vals.estimatedVolume as number | undefined,
      ),
    onSuccess: (res) => {
      toast({
        title: res.allowed ? 'Envío permitido' : 'Envío bloqueado',
        description: res.allowed
          ? 'El dominio puede enviar correo'
          : res.blockReasons.join('; '),
        variant: res.allowed ? 'default' : 'destructive',
      });
    },
    onError: (err) =>
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const domains = domainsData?.items ?? [];
  const filtered = searchDomain
    ? domains.filter((d) => d.domain.toLowerCase().includes(searchDomain.toLowerCase()))
    : domains;
  const selectedDomain = domains.find((d) => d.id === selectedDomainId);

  function warmupLabel(status: string): string {
    if (status === 'WARM') return 'Calentado';
    if (status === 'WARMING') return 'Calentando';
    return 'Frío';
  }
  function warmupVariant(status: string): 'default' | 'secondary' | 'outline' {
    if (status === 'WARM') return 'default';
    if (status === 'WARMING') return 'secondary';
    return 'outline';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Deliverability</h1>
        <p className="text-sm text-muted-foreground">
          Gobernanza de entrega por dominio · warmup · reputación (§9)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Selector de dominio */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Seleccionar Dominio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar dominio…"
                className="pl-8"
                value={searchDomain}
                onChange={(e) => setSearchDomain(e.target.value)}
              />
            </div>
            <div className="max-h-96 overflow-y-auto space-y-1">
              {loadingDomains
                ? Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))
                : filtered.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDomainId(d.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        d.id === selectedDomainId
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      {d.domain}
                    </button>
                  ))}
            </div>
          </CardContent>
        </Card>

        {/* Panel de governance */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedDomainId ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <TrendingUp className="h-8 w-8" />
                <p>Selecciona un dominio para ver su estado de deliverability</p>
              </CardContent>
            </Card>
          ) : loadingGovernance ? (
            <Card>
              <CardContent className="space-y-4 p-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : governance ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{governance.domain}</h2>
                  <p className="text-xs text-muted-foreground">
                    Throttle rate: {governance.throttleRate}%
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={governance.allowed ? 'default' : 'destructive'}
                    className="text-sm px-3"
                  >
                    {governance.allowed ? (
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                    ) : (
                      <XCircle className="mr-1 h-4 w-4" />
                    )}
                    {governance.allowed ? 'Puede enviar' : 'Bloqueado'}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => setCheckDialogOpen(true)}>
                    <Gauge className="mr-2 h-4 w-4" />
                    Check envío
                  </Button>
                </div>
              </div>

              {!governance.allowed && governance.blockReasons.length > 0 && (
                <Card className="border-destructive">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-destructive">Motivos de bloqueo</p>
                        <ul className="mt-1 space-y-0.5">
                          {governance.blockReasons.map((r, i) => (
                            <li key={i} className="text-xs text-muted-foreground font-mono">
                              · {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Estado warmup nodo</p>
                      <Badge variant={warmupVariant(governance.nodeWarmupStatus)}>
                        {warmupLabel(governance.nodeWarmupStatus)}
                      </Badge>
                    </div>
                    {governance.warmupDailyLimit !== null && (
                      <div>
                        <p className="text-xs text-muted-foreground">Límite diario warmup</p>
                        <p className="font-medium">{governance.warmupDailyLimit.toLocaleString('es-ES')} emails</p>
                      </div>
                    )}
                    <ScoreBar label="Reputación nodo" score={governance.nodeReputationScore} />
                    <ScoreBar label="Confianza tenant" score={governance.tenantTrustScore} />
                    <ScoreBar label="Salud dominio" score={governance.domainHealthScore} />
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>

      {/* Dialog check envío */}
      <Dialog open={checkDialogOpen} onOpenChange={setCheckDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verificar permiso de envío</DialogTitle>
            <DialogDescription>
              Dominio: <strong>{selectedDomain?.domain}</strong>
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={checkForm.handleSubmit((v) => checkMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>Volumen estimado (emails, opcional)</Label>
              <Input
                type="number"
                min="1"
                placeholder="1000"
                {...checkForm.register('estimatedVolume')}
              />
            </div>
            {checkMutation.data && (
              <div
                className={`rounded border p-3 text-sm ${
                  checkMutation.data.allowed
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-destructive bg-destructive/10 text-destructive'
                }`}
              >
                <p className="font-semibold">
                  {checkMutation.data.allowed ? '✓ Permitido' : '✗ Bloqueado'}
                </p>
                {!checkMutation.data.allowed && checkMutation.data.blockReasons.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs font-mono">
                    {checkMutation.data.blockReasons.map((r, i) => (
                      <li key={i}>· {r}</li>
                    ))}
                  </ul>
                )}
                {checkMutation.data.volumeExceedsLimit && (
                  <p className="text-xs mt-1">
                    Límite warmup: {checkMutation.data.warmupDailyLimit?.toLocaleString('es-ES')} emails/día
                  </p>
                )}
                <p className="text-xs mt-1">Throttle rate: {checkMutation.data.throttleRate}%</p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCheckDialogOpen(false)}>
                Cerrar
              </Button>
              <Button type="submit" disabled={checkMutation.isPending}>
                {checkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verificar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
