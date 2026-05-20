'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search, KeyRound, RefreshCw, Copy, Check, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { credentialsApi } from '@/lib/api/credentials.api';
import { domainsApi } from '@/lib/api/domains.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, formatDate } from '@/lib/utils';

const rotateSchema = z.object({
  newSelector: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i, 'Solo letras, números y guiones')
    .max(63)
    .optional()
    .or(z.literal('')),
});
type RotateForm = z.infer<typeof rotateSchema>;

export default function CredentialsPage() {
  const queryClient = useQueryClient();
  const [searchDomain, setSearchDomain] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: domainsData, isLoading: loadingDomains } = useQuery({
    queryKey: ['domains-credentials', 1, 100],
    queryFn: () => domainsApi.findAll(1, 100),
  });

  const { data: dkim, isLoading: loadingDkim } = useQuery({
    queryKey: ['dkim-status', selectedDomainId],
    queryFn: () => credentialsApi.getDkimStatus(selectedDomainId!),
    enabled: !!selectedDomainId,
  });

  const rotateForm = useForm<RotateForm>({ resolver: zodResolver(rotateSchema) });

  const rotateMutation = useMutation({
    mutationFn: (vals: RotateForm) =>
      credentialsApi.rotateDkim(selectedDomainId!, {
        newSelector: vals.newSelector || undefined,
      }),
    onSuccess: (res) => {
      toast({
        title: 'DKIM rotado correctamente',
        description: `Nuevo selector: ${res.newSelector}`,
      });
      queryClient.invalidateQueries({ queryKey: ['dkim-status', selectedDomainId] });
      setRotateOpen(false);
      rotateForm.reset();
    },
    onError: (err) =>
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }),
  });

  async function copyToClipboard(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const domains = domainsData?.items ?? [];
  const filtered = searchDomain
    ? domains.filter((d) => d.domain.toLowerCase().includes(searchDomain.toLowerCase()))
    : domains;
  const selectedDomain = domains.find((d) => d.id === selectedDomainId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Credenciales</h1>
        <p className="text-sm text-muted-foreground">
          Gestión y rotación de claves DKIM RSA-2048 por dominio (§23)
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

        {/* Panel DKIM */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedDomainId ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <KeyRound className="h-8 w-8" />
                <p>Selecciona un dominio para ver sus credenciales</p>
              </CardContent>
            </Card>
          ) : loadingDkim ? (
            <Card>
              <CardContent className="space-y-4 p-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{selectedDomain?.domain}</h2>
                  <p className="text-xs text-muted-foreground">
                    {dkim?.lastUpdatedAt
                      ? `Última rotación: ${formatDate(dkim.lastUpdatedAt)}`
                      : 'Sin claves generadas'}
                  </p>
                </div>
                <Button size="sm" onClick={() => setRotateOpen(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Rotar DKIM
                </Button>
              </div>

              {dkim?.selector ? (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Selector activo</p>
                      <Badge variant="outline" className="font-mono text-sm">
                        {dkim.selector}
                      </Badge>
                    </div>

                    {dkim.dnsRecord && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">Registro DNS TXT (copiar en tu DNS)</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            onClick={() => copyToClipboard(dkim.dnsRecord!, 'dns')}
                          >
                            {copied === 'dns' ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                        <pre className="rounded bg-muted p-3 text-xs font-mono overflow-auto max-h-32 whitespace-pre-wrap break-all">
                          {dkim.dnsRecord}
                        </pre>
                      </div>
                    )}

                    {dkim.publicKey && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">Clave pública RSA-2048</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            onClick={() => copyToClipboard(dkim.publicKey!, 'pub')}
                          >
                            {copied === 'pub' ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                        <pre className="rounded bg-muted p-3 text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap break-all">
                          {dkim.publicKey}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <KeyRound className="h-6 w-6" />
                    <p className="text-sm">Este dominio no tiene claves DKIM generadas aún</p>
                    <Button size="sm" className="mt-2" onClick={() => setRotateOpen(true)}>
                      Generar claves DKIM
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dialog rotar DKIM */}
      <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotar claves DKIM</DialogTitle>
            <DialogDescription>
              Se generará un nuevo par RSA-2048. El selector anterior quedará inactivo.
              Dominio: <strong>{selectedDomain?.domain}</strong>
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={rotateForm.handleSubmit((v) => rotateMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-1">
              <Label>
                Nuevo selector{' '}
                <span className="text-muted-foreground text-xs">(opcional — se genera automáticamente)</span>
              </Label>
              <Input
                placeholder="mail2026"
                {...rotateForm.register('newSelector')}
              />
              {rotateForm.formState.errors.newSelector && (
                <p className="text-xs text-destructive">
                  {rotateForm.formState.errors.newSelector.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Solo letras minúsculas, números y guiones. Max 63 caracteres.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRotateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={rotateMutation.isPending}>
                {rotateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Rotar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
