'use client';

import { RefreshCw } from 'lucide-react';
import { RequirePermission } from '@/components/admin/bits';
import { ServiceStatusBadge } from '@/components/admin/monitoring-bits';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, DetailRow, ErrorState, PageHeader, Skeleton, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/client/api';
import { formatBytes, formatDateTime, formatDuration, formatNumber } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';

interface SystemStatus {
  services: { id: string; label: string; status: string; detail: string }[];
  database: { bytes: number; version: string; connections: number; maxConnections: number } | null;
  tables: { table: string; rows: number; bytes: number }[];
  migrations: { name: string; appliedAt: string }[];
  runtime: {
    node: string;
    environment: string;
    scannerVersion: string;
    workerMode: string;
    appUrl: string;
    uptimeSeconds: number;
    memoryMb: number;
  };
  adapters: { id: string; label: string; kind: string; examples?: string[] }[];
}

const KIND_LABELS: Record<string, string> = { api: 'Job-board API', html: 'Page reading', ai: 'Language model', browser: 'Headless browser' };

function SystemView() {
  const { data, error, isLoading, isRefreshing, mutate } = useApi<SystemStatus>('/api/admin/system');

  return (
    <>
      <PageHeader
        title="System"
        description="Configuration and health of this deployment. Secrets are never shown here."
        actions={
          <Button icon={<RefreshCw className="h-4 w-4" />} loading={isRefreshing} onClick={() => mutate()}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Services" />
            <ul className="divide-y divide-line">
              {data.services.map(service => (
                <li key={service.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-medium text-ink">{service.label}</p>
                    <p className="break-words text-sm text-muted">{service.detail}</p>
                  </div>
                  <ServiceStatusBadge status={service.status} />
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Application" />
              <dl className="divide-y divide-line px-4 sm:px-5">
                <DetailRow label="Environment">{data.runtime.environment}</DetailRow>
                <DetailRow label="Public URL">
                  <span className="break-all">{data.runtime.appUrl}</span>
                </DetailRow>
                <DetailRow label="Node.js">{data.runtime.node}</DetailRow>
                <DetailRow label="Scanner version">{data.runtime.scannerVersion}</DetailRow>
                <DetailRow label="Worker mode">{data.runtime.workerMode}</DetailRow>
                <DetailRow label="Process uptime">{formatDuration(data.runtime.uptimeSeconds * 1000)}</DetailRow>
                <DetailRow label="Memory in use">{formatNumber(data.runtime.memoryMb)} MB</DetailRow>
              </dl>
            </Card>

            <Card>
              <CardHeader title="Database" />
              {data.database ? (
                <dl className="divide-y divide-line px-4 sm:px-5">
                  <DetailRow label="PostgreSQL">{data.database.version}</DetailRow>
                  <DetailRow label="Size">{formatBytes(data.database.bytes)}</DetailRow>
                  <DetailRow label="Connections">
                    {formatNumber(data.database.connections)} of {formatNumber(data.database.maxConnections)}
                  </DetailRow>
                  <DetailRow label="Migrations applied">{formatNumber(data.migrations.length)}</DetailRow>
                </dl>
              ) : (
                <p className="px-5 py-4 text-sm text-danger">The database did not respond.</p>
              )}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader title="Largest tables" />
              {data.tables.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">No table statistics available.</p>
              ) : (
                <TableWrap>
                  <Table className="min-w-[420px]">
                    <thead>
                      <tr>
                        <Th>Table</Th>
                        <Th className="text-right">Rows (estimate)</Th>
                        <Th className="text-right">Size</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tables.map(table => (
                        <Tr key={table.table}>
                          <Td className="font-mono text-sm">{table.table}</Td>
                          <Td className="tabular text-right text-sm">{formatNumber(table.rows)}</Td>
                          <Td className="tabular text-right text-sm">{formatBytes(table.bytes)}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Migrations" description="Applied in order at startup; each runs once." />
              {data.migrations.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">No migration records found.</p>
              ) : (
                <TableWrap>
                  <Table className="min-w-[420px]">
                    <thead>
                      <tr>
                        <Th>Migration</Th>
                        <Th>Applied</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.migrations.map(migration => (
                        <Tr key={migration.name}>
                          <Td className="font-mono text-sm">{migration.name}</Td>
                          <Td className="whitespace-nowrap text-sm">{formatDateTime(migration.appliedAt)}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title="Source adapters" description="How careers pages are read, from most to least reliable. Detection picks one automatically; admins can force one per source." />
            <TableWrap>
              <Table className="min-w-[560px]">
                <thead>
                  <tr>
                    <Th>Adapter</Th>
                    <Th>Type</Th>
                    <Th>Example URLs</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.adapters.map(adapter => (
                    <Tr key={adapter.id}>
                      <Td>
                        <span className="font-medium text-ink">{adapter.label}</span>
                        <span className="block font-mono text-xs text-muted">{adapter.id}</span>
                      </Td>
                      <Td>
                        <Badge tone="outline">{KIND_LABELS[adapter.kind] ?? adapter.kind}</Badge>
                      </Td>
                      <Td className="text-sm text-muted">{adapter.examples && adapter.examples.length > 0 ? adapter.examples.join(', ') : '—'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
        </div>
      )}
    </>
  );
}

export default function AdminSystemPage() {
  return (
    <RequirePermission permission="overview.read">
      <SystemView />
    </RequirePermission>
  );
}
