'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Shield, Save, Loader2, Plus, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { antispamApi, type UpsertAntispamPolicyPayload } from '@/lib/api/antispam.api';
import { domainsApi } from '@/lib/api/domains.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage } from '@/lib/utils';

const policySchema = z.object({
  enabled: z.boolean(),
  spamThreshold: z.number().min(0).max(1),
  rejectAbove: z.number().min(0).max(1),
  greylistEnabled: z.boolean(),
});

type PolicyForm = z.infer<typeof policySchema>;

export default function AntispamPage() {
  const queryClient = useQueryClient();
  const [selectedDomainId, setSelectedDomainId] = useState<string>('');
  const [whitelistEntry, setWhitelistEntry] = useState('');
  const [blacklistEntry, setBlacklistEntry] = useState('');
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [blacklist, setBlacklist] = useState<string[]>([]);

  const { data: domainsData } = useQuery({
    queryKey: ['domains', 'all'],
    queryFn: () => domainsApi.findAll(1, 200),
  });

  const { data: policyData, isLoading: loadingPolicy } = useQuery({
    queryKey: ['antispam-policy', selectedDomainId],
    queryFn: async () => {
      const result = await antispamApi.getPolicy(selectedDomainId);
      const policy = result.exists
        ? (result as UpsertAntispamPolicyPayload & { exists: true })
        : (result as { exists: false; defaults: UpsertAntispamPolicyPayload }).defaults;
      setWhitelist(policy.whitelist ?? []);
      setBlacklist(policy.blacklist ?? []);
      return result;
    },
    enabled: Boolean(selectedDomainId),
  });

  const form = useForm<PolicyForm>({
    resolver: zodResolver(policySchema),
    values:
      policyData && policyData.exists
        ? {
            enabled: (policyData as { enabled: boolean }).enabled,
            spamThreshold: (policyData as { spamThreshold: number }).spamThreshold,
            rejectAbove: (policyData as { rejectAbove: number }).rejectAbove,
            greylistEnabled: (policyData as { greylistEnabled: boolean }).greylistEnabled,
          }
        : policyData && !policyData.exists
          ? {
              enabled: (policyData as { defaults: PolicyForm }).defaults.enabled,
              spamThreshold: (policyData as { defaults: PolicyForm }).defaults.spamThreshold,
              rejectAbove: (policyData as { defaults: PolicyForm }).defaults.rejectAbove,
              greylistEnabled: (policyData as { defaults: PolicyForm }).defaults.greylistEnabled,
            }
          : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: (values: PolicyForm) =>
      antispamApi.upsertPolicy(selectedDomainId, { ...values, whitelist, blacklist }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['antispam-policy', selectedDomainId] });
      toast({ title: 'Política antispam guardada', variant: 'success' });
    },
    onError: (err) => toast({ title: 'Error al guardar', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const addToList = (list: 'whitelist' | 'blacklist') => {
    const entry = list === 'whitelist' ? whitelistEntry.trim() : blacklistEntry.trim();
    if (!entry) return;
    if (list === 'whitelist') {
      if (!whitelist.includes(entry)) setWhitelist((p) => [...p, entry]);
      setWhitelistEntry('');
    } else {
      if (!blacklist.includes(entry)) setBlacklist((p) => [...p, entry]);
      setBlacklistEntry('');
    }
  };

  const removeFromList = (list: 'whitelist' | 'blacklist', entry: string) => {
    if (list === 'whitelist') setWhitelist((p) => p.filter((e) => e !== entry));
    else setBlacklist((p) => p.filter((e) => e !== entry));
  };

  const domains = domainsData?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Configuración antispam</h2>
        <p className="text-muted-foreground">
          Ajusta la política de filtrado de spam para cada dominio
        </p>
      </div>

      {/* Selector de dominio */}
      <Card>
        <CardHeader>
          <CardTitle>Seleccionar dominio</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {selectedDomainId && (
        <>
          {loadingPolicy ? (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ) : (
            <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Configuración principal */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Parámetros del filtro
                    </CardTitle>
                    <CardDescription>
                      Umbral de spam y modo de greylisting
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="enabled"
                        {...form.register('enabled')}
                        className="h-4 w-4 rounded border"
                      />
                      <Label htmlFor="enabled">Filtro antispam activo</Label>
                    </div>

                    <div className="space-y-1">
                      <Label>Umbral de spam (0–1)</Label>
                      <Input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        {...form.register('spamThreshold', { valueAsNumber: true })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Mensajes por encima de este umbral se marcan como spam
                      </p>
                      {form.formState.errors.spamThreshold && (
                        <p className="text-xs text-destructive">{form.formState.errors.spamThreshold.message}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label>Rechazo automático (0–1)</Label>
                      <Input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        {...form.register('rejectAbove', { valueAsNumber: true })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Mensajes con score superior a este valor se rechazan
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="greylist"
                        {...form.register('greylistEnabled')}
                        className="h-4 w-4 rounded border"
                      />
                      <Label htmlFor="greylist">Greylisting habilitado</Label>
                    </div>
                  </CardContent>
                </Card>

                {/* Listas blanca/negra */}
                <div className="space-y-4">
                  {/* Whitelist */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Lista blanca</CardTitle>
                      <CardDescription>Remitentes siempre permitidos</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="email@dominio.com"
                          value={whitelistEntry}
                          onChange={(e) => setWhitelistEntry(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToList('whitelist'); } }}
                        />
                        <Button type="button" size="icon" variant="outline" onClick={() => addToList('whitelist')}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {whitelist.map((entry) => (
                          <Badge key={entry} variant="secondary" className="gap-1">
                            {entry}
                            <button type="button" onClick={() => removeFromList('whitelist', entry)}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {whitelist.length === 0 && (
                          <p className="text-xs text-muted-foreground">Sin entradas</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Blacklist */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Lista negra</CardTitle>
                      <CardDescription>Remitentes siempre bloqueados</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="email@dominio.com"
                          value={blacklistEntry}
                          onChange={(e) => setBlacklistEntry(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToList('blacklist'); } }}
                        />
                        <Button type="button" size="icon" variant="outline" onClick={() => addToList('blacklist')}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {blacklist.map((entry) => (
                          <Badge key={entry} variant="destructive" className="gap-1">
                            {entry}
                            <button type="button" onClick={() => removeFromList('blacklist', entry)}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        {blacklist.length === 0 && (
                          <p className="text-xs text-muted-foreground">Sin entradas</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="mt-4">
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Guardar política
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
