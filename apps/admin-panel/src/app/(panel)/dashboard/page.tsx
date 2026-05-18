'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Package,
  Server,
  Building2,
  Globe,
  MailOpen,
  ArrowLeftRight,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { plansApi } from '@/lib/api/plans.api';
import { nodesApi } from '@/lib/api/nodes.api';
import { tenantsApi } from '@/lib/api/tenants.api';
import { domainsApi } from '@/lib/api/domains.api';
import { mailboxesApi } from '@/lib/api/mailboxes.api';
import { aliasesApi } from '@/lib/api/aliases.api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface StatCardProps {
  title: string;
  value: number | undefined;
  icon: React.ElementType;
  description?: string;
  isLoading: boolean;
}

function StatCard({ title, value, icon: Icon, description, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold">{value?.toLocaleString('es-ES') ?? '-'}</div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: plans, isLoading: loadingPlans } = useQuery({
    queryKey: ['plans', 'count'],
    queryFn: () => plansApi.findAll(1, 1),
  });

  const { data: nodes, isLoading: loadingNodes } = useQuery({
    queryKey: ['nodes', 'count'],
    queryFn: () => nodesApi.findAll(1, 1),
  });

  const { data: tenants, isLoading: loadingTenants } = useQuery({
    queryKey: ['tenants', 'count'],
    queryFn: () => tenantsApi.findAll(1, 1),
  });

  const { data: domains, isLoading: loadingDomains } = useQuery({
    queryKey: ['domains', 'count'],
    queryFn: () => domainsApi.findAll(1, 1),
  });

  const { data: mailboxes, isLoading: loadingMailboxes } = useQuery({
    queryKey: ['mailboxes', 'count'],
    queryFn: () => mailboxesApi.findAll(1, 1),
  });

  const { data: aliases, isLoading: loadingAliases } = useQuery({
    queryKey: ['aliases', 'count'],
    queryFn: () => aliasesApi.findAll(1, 1),
  });

  // Datos para gráfico resumen
  const chartData = [
    { name: 'Planes', total: plans?.total ?? 0 },
    { name: 'Nodos', total: nodes?.total ?? 0 },
    { name: 'Tenants', total: tenants?.total ?? 0 },
    { name: 'Dominios', total: domains?.total ?? 0 },
    { name: 'Buzones', total: mailboxes?.total ?? 0 },
    { name: 'Alias', total: aliases?.total ?? 0 },
  ];

  const isLoadingChart = loadingPlans || loadingNodes || loadingTenants || loadingDomains || loadingMailboxes || loadingAliases;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Resumen de la plataforma 4nexa</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Planes"
          value={plans?.total}
          icon={Package}
          isLoading={loadingPlans}
          description="Planes de servicio"
        />
        <StatCard
          title="Nodos"
          value={nodes?.total}
          icon={Server}
          isLoading={loadingNodes}
          description="Servidores de correo"
        />
        <StatCard
          title="Tenants"
          value={tenants?.total}
          icon={Building2}
          isLoading={loadingTenants}
          description="Organizaciones"
        />
        <StatCard
          title="Dominios"
          value={domains?.total}
          icon={Globe}
          isLoading={loadingDomains}
          description="Dominios activos"
        />
        <StatCard
          title="Buzones"
          value={mailboxes?.total}
          icon={MailOpen}
          isLoading={loadingMailboxes}
          description="Cuentas de correo"
        />
        <StatCard
          title="Alias"
          value={aliases?.total}
          icon={ArrowLeftRight}
          isLoading={loadingAliases}
          description="Redirecciones"
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Distribución de recursos
          </CardTitle>
          <CardDescription>
            Totales actuales por tipo de recurso en la plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingChart ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={256}>
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="total"
                  name="Total"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
