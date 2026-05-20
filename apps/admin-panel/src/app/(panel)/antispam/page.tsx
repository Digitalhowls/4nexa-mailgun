'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Search,
  Shield,
  ShieldOff,
  Trash2,
  Loader2,
  FlaskConical,
  PlusCircle,
  MinusCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { antispamApi, type UpsertAntispamPolicyPayload } from '@/lib/api/antispam.api';
import { domainsApi, type Domain } from '@/lib/api/domains.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

const policySchema = z
  .object({
    enabled: z.boolean(),
    spamThreshold: z.number().min(0).max(1),
    rejectAbove: z.number().min(0).max(1),
    greylistEnabled: z.boolean(),
    whitelistRaw: z.string(),
    blacklistRaw: z.string(),
  })
  .refine((v) => v.rejectAbove >= v.spamThreshold, {
    message: 'El umbral de rechazo debe ser ≥ umbral de spam',
    path: ['rejectAbove'],
  });

type PolicyForm = z.infer<typeof policySchema>;

const evalSchema = z.object({
  senderEmail: z.string().email('Email inválido'),
  spamScore: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined)),
});
type EvalForm = z.infer<typeof evalSchema>;

export default function AntispamPage() {
  const queryClient = useQueryClient();
  const [searchDomain, setSearchDomain] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [evalDialogOpen, setEvalDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { data: domainsData, isLoading: loadingDomains } = useQuery({
    queryKey: ['domains-antispam', 1, 100],
    queryFn: () => domainsApi.findAll(1, 100),
  });

  const { data: policy, isLoading: loadingPolicy } = useQuery({
    queryKey: ['antispam-policy', selectedDomainId],
    queryFn: () => antispamApi.getPolicy(selectedDomainId!),
    enabled: !!selectedDomainId,
  });

  const policyForm = useForm<PolicyForm>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      enabled: true,
      spamThreshold: 0.8,
      rejectAbove: 0.95,
      greylistEnabled: false,
      whitelistRaw: '',
      blacklistRaw: '',
    },
  });

  const evalForm = useForm<EvalForm>();

  const upsertMutation = useMutation({
    mutationFn: (vals: PolicyForm) => {
      const payload: UpsertAntispamPolicyPayload = {
        enabled: vals.enabled,
        spamThreshold: vals.spamThreshold,
        rejectAbove: vals.rejectAbove,
        greylistEnabled: vals.greylistEnabled,
        whitelist: vals.whitelistRaw
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        blacklist: vals.blacklistRaw
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      return antispamApi.upsertPolicy(selectedDomainId!, payload);
    },
    onSuccess: () => {
      toast({ title: 'Política guardada' });
      queryClient.invalidateQueries({ queryKey: ['antispam-policy', selectedDomainId] });
      setPolicyDialogOpen(false);
    },
    onError: (err) =>
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => antispamApi.deletePolicy(selectedDomainId!),
    onSuccess: () => {
      toast({ title: 'Política eliminada' });
      queryClient.invalidateQueries({ queryKey: ['antispam-policy', selectedDomainId] });
      setDeleteConfirm(false);
    },
    onError: (err) =>
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const evalMutation = useMutation({
    mutationFn: (vals: EvalForm) =>
      antispamApi.evaluateMessage(selectedDomainId!, {
        senderEmail: vals.senderEmail,
        spamScore: vals.spamScore as number | undefined,
      }),
    onSuccess: (res) => {
      const colors: Record<string, string> = {
        ACCEPT: 'text-green-700',
        FLAG: 'text-amber-600',
        REJECT: 'text-destructive',
        GREYLISTED: 'text-blue-600',
      };
      toast({
        title: `Resultado: ${res.action}`,
        description: res.reason,
      });
    },
    onError: (err) =>
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  function openEdit() {
    // Leer los valores actuales del tipo correcto según si exists o no
    const existing = policy?.exists === true ? policy : null;
    const defaults = policy?.exists === false ? policy.defaults : null;
    policyForm.reset({
      enabled: existing?.enabled ?? defaults?.enabled ?? true,
      spamThreshold: existing?.spamThreshold ?? defaults?.spamThreshold ?? 0.8,
      rejectAbove: existing?.rejectAbove ?? defaults?.rejectAbove ?? 0.95,
      greylistEnabled: existing?.greylistEnabled ?? defaults?.greylistEnabled ?? false,
      whitelistRaw: (existing?.whitelist ?? defaults?.whitelist ?? []).join('\n'),
      blacklistRaw: (existing?.blacklist ?? defaults?.blacklist ?? []).join('\n'),
    });
    setPolicyDialogOpen(true);
  }

  const domains = domainsData?.items ?? [];
  const filtered = searchDomain
    ? domains.filter((d) => d.domain.toLowerCase().includes(searchDomain.toLowerCase()))
    : domains;

  const selectedDomain = domains.find((d) => d.id === selectedDomainId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Antispam</h1>
        <p className="text-sm text-muted-foreground">
          Políticas de filtrado de spam por dominio (§27)
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

        {/* Panel de política */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedDomainId ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Shield className="h-8 w-8" />
                <p>Selecciona un dominio para ver su política antispam</p>
              </CardContent>
            </Card>
          ) : loadingPolicy ? (
            <Card>
              <CardContent className="space-y-4 p-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{selectedDomain?.domain}</h2>
                  <Badge
                    variant={policy?.exists ? (policy.enabled ? 'default' : 'secondary') : 'outline'}
                  >
                    {policy?.exists
                      ? policy.enabled
                        ? 'Política activa'
                        : 'Política desactivada'
                      : 'Sin política (defaults)'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEvalDialogOpen(true)}>
                    <FlaskConical className="mr-2 h-4 w-4" />
                    Evaluar mensaje
                  </Button>
                  {policy?.exists && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setDeleteConfirm(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </Button>
                  )}
                  <Button size="sm" onClick={openEdit}>
                    {policy?.exists ? 'Editar' : 'Crear política'}
                  </Button>
                </div>
              </div>

              {policy && policy.exists === true && (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Umbral spam (FLAG)</p>
                        <p className="font-semibold">{(policy.spamThreshold * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Umbral rechazo (REJECT)</p>
                        <p className="font-semibold">{(policy.rejectAbove * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Greylisting</p>
                        <p className="font-semibold">
                          {policy.greylistEnabled ? 'Activado' : 'Desactivado'}
                        </p>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Whitelist ({policy.whitelist.length})
                        </p>
                        {policy.whitelist.length === 0 ? (
                          <p className="text-muted-foreground italic text-xs">Vacía</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {policy.whitelist.map((e) => (
                              <li key={e} className="font-mono text-xs text-green-700">{e}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Blacklist ({policy.blacklist.length})
                        </p>
                        {policy.blacklist.length === 0 ? (
                          <p className="text-muted-foreground italic text-xs">Vacía</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {policy.blacklist.map((e) => (
                              <li key={e} className="font-mono text-xs text-destructive">{e}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dialog editar política */}
      <Dialog open={policyDialogOpen} onOpenChange={setPolicyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Política antispam — {selectedDomain?.domain}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={policyForm.handleSubmit((v) => upsertMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Umbral spam (FLAG) 0–1</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  {...policyForm.register('spamThreshold', { valueAsNumber: true })}
                />
                {policyForm.formState.errors.spamThreshold && (
                  <p className="text-xs text-destructive">{policyForm.formState.errors.spamThreshold.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Umbral rechazo (REJECT) 0–1</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  {...policyForm.register('rejectAbove', { valueAsNumber: true })}
                />
                {policyForm.formState.errors.rejectAbove && (
                  <p className="text-xs text-destructive">{policyForm.formState.errors.rejectAbove.message}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...policyForm.register('enabled')} className="h-4 w-4" />
                Política activa
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" {...policyForm.register('greylistEnabled')} className="h-4 w-4" />
                Greylisting en primeros contactos
              </label>
            </div>
            <div className="space-y-1">
              <Label>Whitelist (un email o dominio por línea)</Label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="trusted@example.com&#10;@safedomain.com"
                {...policyForm.register('whitelistRaw')}
              />
            </div>
            <div className="space-y-1">
              <Label>Blacklist (un email o dominio por línea)</Label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="spammer@evil.com&#10;@blocked.net"
                {...policyForm.register('blacklistRaw')}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPolicyDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog evaluar mensaje */}
      <Dialog open={evalDialogOpen} onOpenChange={setEvalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Evaluar mensaje — {selectedDomain?.domain}</DialogTitle>
            <DialogDescription>
              Simula la decisión antispam para un remitente con score dado.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={evalForm.handleSubmit((v) => evalMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>Email del remitente</Label>
              <Input type="email" placeholder="sender@example.com" {...evalForm.register('senderEmail')} />
              {evalForm.formState.errors.senderEmail && (
                <p className="text-xs text-destructive">{evalForm.formState.errors.senderEmail.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Spam score (0–1, opcional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                placeholder="0.75"
                {...evalForm.register('spamScore')}
              />
            </div>
            {evalMutation.data && (
              <div
                className={`rounded border p-3 text-sm font-semibold ${
                  evalMutation.data.action === 'ACCEPT'
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : evalMutation.data.action === 'REJECT'
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}
              >
                {evalMutation.data.action} — {evalMutation.data.reason}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEvalDialogOpen(false)}>
                Cerrar
              </Button>
              <Button type="submit" disabled={evalMutation.isPending}>
                {evalMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Evaluar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmar eliminación */}
      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar política antispam?</DialogTitle>
            <DialogDescription>
              Se eliminarán todas las reglas de <strong>{selectedDomain?.domain}</strong>. El dominio
              pasará a usar los valores por defecto del sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
