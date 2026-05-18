'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { domainsApi, type Domain, type DnsStatus } from '@/lib/api/domains.api';
import { toast } from '@/components/ui/use-toast';
import { getErrorMessage, formatDate } from '@/lib/utils';

function DnsRow({ label, valid, record }: { label: string; valid: boolean; record: string | null | string[] }) {
  const text = Array.isArray(record) ? record.join(', ') : record;
  return (
    <div className="flex items-start gap-3 py-2">
      {valid ? (
        <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
      )}
      <div>
        <p className="text-sm font-medium">{label}</p>
        {text ? (
          <code className="block break-all text-xs text-muted-foreground">{text}</code>
        ) : (
          <p className="text-xs text-muted-foreground">Sin registro</p>
        )}
      </div>
    </div>
  );
}

export default function DomainsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dnsDialogOpen, setDnsDialogOpen] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [dnsStatus, setDnsStatus] = useState<DnsStatus | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['domains', page],
    queryFn: () => domainsApi.findAll(page, 20),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => domainsApi.verifyDns(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setDnsStatus(result);
      setDnsDialogOpen(true);
    },
    onError: (err) => toast({ title: 'Error al verificar DNS', description: getErrorMessage(err), variant: 'destructive' }),
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Mis dominios</h2>
        <p className="text-muted-foreground">
          Dominios de correo asociados a tu cuenta ({data?.total ?? 0} en total)
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dominio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>MX</TableHead>
              <TableHead>SPF</TableHead>
              <TableHead>DKIM</TableHead>
              <TableHead>DMARC</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-[120px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No tienes dominios registrados. Contacta con soporte para añadir uno.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              data?.items.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell className="font-mono font-medium">{domain.domain}</TableCell>
                  <TableCell>
                    <Badge variant={domain.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {domain.status === 'ACTIVE' ? 'Activo' : domain.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {domain.mxRecord ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    {domain.spfRecord ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    {domain.dkimPublicKey ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    {domain.dmarcRecord ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(domain.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={verifyMutation.isPending}
                      onClick={() => {
                        setSelectedDomain(domain);
                        verifyMutation.mutate(domain.id);
                      }}
                    >
                      {verifyMutation.isPending && verifyMutation.variables === domain.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1.5">Verificar</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <span className="flex items-center px-3 text-sm">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
        </div>
      )}

      {/* Dialog resultado DNS */}
      <Dialog open={dnsDialogOpen} onOpenChange={setDnsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estado DNS — {selectedDomain?.domain}</DialogTitle>
            <DialogDescription>
              Resultado de la verificación de registros DNS en tiempo real.
            </DialogDescription>
          </DialogHeader>
          {dnsStatus && (
            <div className="divide-y">
              <DnsRow label="MX" valid={dnsStatus.mx.valid} record={dnsStatus.mx.records} />
              <DnsRow label="SPF" valid={dnsStatus.spf.valid} record={dnsStatus.spf.record} />
              <DnsRow label="DKIM" valid={dnsStatus.dkim.valid} record={dnsStatus.dkim.record} />
              <DnsRow label="DMARC" valid={dnsStatus.dmarc.valid} record={dnsStatus.dmarc.record} />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDnsDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
