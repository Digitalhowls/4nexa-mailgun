'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, XCircle, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { deliverabilityApi, type DomainGovernance } from '@/lib/api/deliverability.api';
import { domainsApi } from '@/lib/api/domains.api';
import { getErrorMessage } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-destructive';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct} / 100</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DeliverabilityPage() {
  const [selectedDomainId, setSelectedDomainId] = useState<string>('');
  const [governance, setGovernance] = useState<DomainGovernance | null>(null);
  const [checking, setChecking] = useState(false);

  const { data: domainsData } = useQuery({
    queryKey: ['domains', 'all'],
    queryFn: () => domainsApi.findAll(1, 200),
  });

  const checkGovernance = async (domainId: string) => {
    if (!domainId) return;
    setChecking(true);
    try {
      const result = await deliverabilityApi.getDomainGovernance(domainId);
      setGovernance(result);
    } catch (err) {
      toast({
        title: 'Error al comprobar entregabilidad',
        description: getErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setChecking(false);
    }
  };

  const domains = domainsData?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Entregabilidad</h2>
        <p className="text-muted-foreground">
          Estado de reputación y permisos de envío de tus dominios
        </p>
      </div>

      {/* Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Comprobar dominio</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={selectedDomainId} onValueChange={setSelectedDomainId}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder="Elige un dominio…" />
            </SelectTrigger>
            <SelectContent>
              {domains.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!selectedDomainId || checking}
            onClick={() => checkGovernance(selectedDomainId)}
          >
            {checking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Comprobar
          </Button>
        </CardContent>
      </Card>

      {/* Resultado */}
      {checking && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-full" />
          </CardContent>
        </Card>
      )}

      {!checking && governance && (
        <div className="space-y-4">
          {/* Estado general */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  {governance.domain}
                </CardTitle>
                <Badge variant={governance.allowed ? 'success' : 'destructive'}>
                  {governance.allowed ? (
                    <><CheckCircle className="mr-1 h-3.5 w-3.5" /> Envío permitido</>
                  ) : (
                    <><XCircle className="mr-1 h-3.5 w-3.5" /> Envío bloqueado</>
                  )}
                </Badge>
              </div>
              {governance.blockReasons.length > 0 && (
                <CardDescription className="text-destructive">
                  Motivos: {governance.blockReasons.join(', ')}
                </CardDescription>
              )}
            </CardHeader>
          </Card>

          {/* Scores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Puntuaciones de reputación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScoreBar label="Salud del dominio" score={governance.domainHealthScore / 100} />
              <ScoreBar label="Confianza del tenant" score={governance.tenantTrustScore / 100} />
              <ScoreBar label="Reputación del nodo" score={governance.nodeReputationScore / 100} />
            </CardContent>
          </Card>

          {/* Detalles del nodo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Nodo asignado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID del nodo</span>
                <span className="font-mono">{governance.nodeId ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estado de warmup</span>
                <Badge variant="outline">{governance.nodeWarmupStatus}</Badge>
              </div>
              {governance.warmupDailyLimit !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Límite diario (warmup)</span>
                  <span>{governance.warmupDailyLimit.toLocaleString()} emails</span>
                </div>
              )}
              {governance.throttleRate > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Throttling</span>
                  <span className="text-yellow-600">{governance.throttleRate}%</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
