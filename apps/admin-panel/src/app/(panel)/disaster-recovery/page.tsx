'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  CheckCircle2,
  Server,
  Database,
  Shield,
  Globe2,
  Play,
  Eye,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  disasterRecoveryApi,
  DR_SCENARIOS,
  type DrScenario,
  type DrSimulateResult,
} from '@/lib/api/disaster-recovery.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

const SCENARIO_LABELS: Record<DrScenario, { label: string; icon: React.ElementType; desc: string }> = {
  node_loss: { label: 'Pérdida de nodo', icon: Server, desc: 'Fallo o pérdida de un nodo mail' },
  postgres_corruption: { label: 'Corrupción PostgreSQL', icon: Database, desc: 'Corrupción del volumen de datos' },
  certificate_loss: { label: 'Pérdida de certificados', icon: Shield, desc: 'Pérdida de certificados TLS/DKIM' },
  full_cluster_loss: { label: 'Pérdida de clúster', icon: Globe2, desc: 'Fallo total del clúster (máx impacto)' },
};

const simulateSchema = z.object({
  scenario: z.enum(DR_SCENARIOS),
  nodeId: z.string().uuid('UUID inválido').optional().or(z.literal('')),
  tenantId: z.string().uuid('UUID inválido').optional().or(z.literal('')),
  dryRun: z.boolean(),
});
type SimulateForm = z.infer<typeof simulateSchema>;

export default function DisasterRecoveryPage() {
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [simulateDialogOpen, setSimulateDialogOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<DrScenario>('node_loss');
  const [simulateResult, setSimulateResult] = useState<DrSimulateResult | null>(null);

  const { data: status, isLoading: loadingStatus } = useQuery({
    queryKey: ['dr-status'],
    queryFn: disasterRecoveryApi.getStatus,
    refetchInterval: 30_000,
  });

  const { data: plan, isLoading: loadingPlan } = useQuery({
    queryKey: ['dr-plan', selectedScenario],
    queryFn: () => disasterRecoveryApi.getPlan(selectedScenario),
    enabled: planDialogOpen,
  });

  const simulateForm = useForm<SimulateForm>({
    resolver: zodResolver(simulateSchema),
    defaultValues: { scenario: 'node_loss', dryRun: true },
  });

  const simulateMutation = useMutation({
    mutationFn: (vals: SimulateForm) =>
      disasterRecoveryApi.simulate({
        scenario: vals.scenario,
        nodeId: vals.nodeId || undefined,
        tenantId: vals.tenantId || undefined,
        dryRun: vals.dryRun,
      }),
    onSuccess: (res) => {
      setSimulateResult(res);
      toast({
        title: res.dryRun ? 'Simulación completada (dry-run)' : 'Escenario ejecutado',
        description: `${res.plan.steps.length} pasos procesados · estado: ${res.status}`,
      });
    },
    onError: (err) =>
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  // Derivar estado de salud desde los campos reales del servicio
  const healthStatus = status
    ? status.healthy
      ? 'OK'
      : status.nodesQuarantined > 0
      ? 'DEGRADED'
      : 'CRITICAL'
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Disaster Recovery</h1>
          <p className="text-sm text-muted-foreground">
            Estado del sistema y simulación de escenarios de recuperación (§25)
          </p>
        </div>
        <Button onClick={() => setSimulateDialogOpen(true)}>
          <Play className="mr-2 h-4 w-4" />
          Simular escenario
        </Button>
      </div>

      {/* Estado del sistema */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Estado del sistema</CardTitle>
            {loadingStatus ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <Badge
                variant={
                  healthStatus === 'OK'
                    ? 'default'
                    : healthStatus === 'DEGRADED'
                    ? 'secondary'
                    : 'destructive'
                }
              >
                {healthStatus === 'OK' ? (
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                )}
                {healthStatus}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingStatus ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : status ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatusCell label="Nodos total" value={status.nodesTotal} />
                <StatusCell label="Sanos" value={status.nodesHealthy} color="green" />
                <StatusCell label="Drenando" value={status.nodesDraining} color="amber" />
                <StatusCell label="Cuarentena" value={status.nodesQuarantined} color="red" />
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Dominios totales</p>
                  <p className="text-xl font-bold">{status.domainsTotal}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Con certificados</p>
                  <p className="text-xl font-bold">{status.domainsWithCerts}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Antigüedad último backup</p>
                  <p className="text-xl font-bold">
                    {status.lastBackupAge !== null
                      ? status.lastBackupAge < 60
                        ? `${status.lastBackupAge} min`
                        : `${(status.lastBackupAge / 60).toFixed(1)} h`
                      : 'N/D'}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Comprobado: {new Date(status.checkedAt).toLocaleString('es-ES')}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Planes DR */}
      <div>
        <h2 className="text-base font-semibold mb-3">Planes de recuperación disponibles</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DR_SCENARIOS.map((scenario) => {
            const meta = SCENARIO_LABELS[scenario];
            const Icon = meta.icon;
            return (
              <Card
                key={scenario}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => {
                  setSelectedScenario(scenario);
                  setPlanDialogOpen(true);
                }}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium text-sm">{meta.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{meta.desc}</p>
                  <Button size="sm" variant="ghost" className="w-full mt-2">
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    Ver plan
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Dialog plan DR */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Plan DR — {SCENARIO_LABELS[selectedScenario]?.label}</DialogTitle>
            <DialogDescription>
              RTO: {plan ? `${plan.plan.rtoMinutes} min` : '…'} · RPO:{' '}
              {plan ? `${plan.plan.rpoMinutes} min` : '…'}
            </DialogDescription>
          </DialogHeader>
          {loadingPlan ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : plan ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {plan.plan.steps.map((step) => (
                <div
                  key={step.order}
                  className="flex items-start gap-3 rounded border p-3 text-sm"
                >
                  <span className="min-w-[1.5rem] h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                    {step.order}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{step.action}</span>
                      <Badge variant={step.automated ? 'default' : 'outline'} className="text-xs">
                        {step.automated ? 'Automatizado' : 'Manual'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>
              Cerrar
            </Button>
            <Button
              onClick={() => {
                simulateForm.setValue('scenario', selectedScenario);
                setPlanDialogOpen(false);
                setSimulateDialogOpen(true);
              }}
            >
              <Play className="mr-2 h-4 w-4" />
              Simular este escenario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog simulación */}
      <Dialog
        open={simulateDialogOpen}
        onOpenChange={(open) => {
          setSimulateDialogOpen(open);
          if (!open) setSimulateResult(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Simular escenario DR</DialogTitle>
            <DialogDescription>
              Por defecto en modo dry-run. Activa "Ejecutar en vivo" solo si estás seguro.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={simulateForm.handleSubmit((v) => simulateMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>Escenario</Label>
              <Select
                defaultValue={simulateForm.getValues('scenario')}
                onValueChange={(v) => simulateForm.setValue('scenario', v as DrScenario)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DR_SCENARIOS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCENARIO_LABELS[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Node ID (opcional)</Label>
                <Input placeholder="uuid" {...simulateForm.register('nodeId')} />
                {simulateForm.formState.errors.nodeId && (
                  <p className="text-xs text-destructive">{simulateForm.formState.errors.nodeId.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Tenant ID (opcional)</Label>
                <Input placeholder="uuid" {...simulateForm.register('tenantId')} />
                {simulateForm.formState.errors.tenantId && (
                  <p className="text-xs text-destructive">{simulateForm.formState.errors.tenantId.message}</p>
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                onChange={(e) => simulateForm.setValue('dryRun', e.target.checked)}
                className="h-4 w-4"
              />
              <span>Dry-run (solo simula, no ejecuta acciones)</span>
            </label>

            {simulateResult && (
              <div className="space-y-2 max-h-64 overflow-y-auto rounded border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {simulateResult.dryRun ? '— Resultado dry-run —' : '— Ejecución completada —'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Estado: {simulateResult.status} · RTO: {simulateResult.plan.rtoMinutes} min ·
                  RPO: {simulateResult.plan.rpoMinutes} min
                </p>
                {simulateResult.plan.steps.map((step) => (
                  <div key={step.order} className="flex items-start gap-2 text-sm">
                    <span className="min-w-[1.5rem] text-xs text-muted-foreground font-mono">
                      [{step.order}]
                    </span>
                    <div>
                      <span className="font-mono font-medium">{step.action}</span>
                      <Badge
                        variant={step.automated ? 'default' : 'outline'}
                        className="ml-2 text-xs"
                      >
                        {step.automated ? 'Auto' : 'Manual'}
                      </Badge>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                ))}
                {simulateResult.executed.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-muted-foreground">Acciones ejecutadas:</p>
                    {simulateResult.executed.map((action, i) => (
                      <p key={i} className="text-xs font-mono text-muted-foreground">• {action}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSimulateDialogOpen(false);
                  setSimulateResult(null);
                }}
              >
                Cerrar
              </Button>
              <Button type="submit" disabled={simulateMutation.isPending}>
                {simulateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ejecutar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: 'green' | 'amber' | 'red';
}) {
  const colorClass =
    color === 'green'
      ? 'text-green-600'
      : color === 'amber'
      ? 'text-amber-600'
      : color === 'red'
      ? 'text-destructive'
      : '';
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}
