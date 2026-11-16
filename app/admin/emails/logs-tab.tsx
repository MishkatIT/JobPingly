'use client';

import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { EmailStatusBadge, SearchInput } from '@/components/admin/bits';
import { FilterSelect, SafeEmailFrame, useUrlFilters } from '@/components/admin/ops-bits';
import { Button } from '@/components/ui/button';
import { Dialog, Pagination } from '@/components/ui/overlay';
import { Callout, DetailRow, EmptyState, ErrorState, Skeleton, SkeletonRows, Table, TableWrap, Td, Th, Tr } from '@/components/ui/primitives';
import { errorMessage, qs } from '@/lib/client/api';
import { formatDateTime } from '@/lib/client/format';
import { useApi } from '@/lib/client/use-api';
import { EMAIL_TEMPLATE_TYPES } from '@/lib/constants';
import { TEMPLATE_LABELS } from './types';

interface EmailLog {
  id: string;
  recipientEmail: string;
  subject: string | null;
  templateType: string;
  status: string;
  deliveryStatus: string | null;
  attempts: number | null;
  errorMessage: string | null;
  createdAt: string;
  hasBody: boolean;
  provider: string | null;
}

const PAGE_SIZE = 30;

export function LogsTab() {
  const { params, update } = useUrlFilters();
  const template = (EMAIL_TEMPLATE_TYPES as readonly string[]).includes(params.get('template') ?? '') ? params.get('template')! : '';
  const status = ['sent', 'failed', 'skipped'].includes(params.get('status') ?? '') ? params.get('status')! : '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<EmailLog | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') ?? '') !== search.trim()) update({ q: search.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, meta, error, isLoading, mutate } = useApi<EmailLog[]>(`/api/admin/emails/logs${qs({ q: params.get('q') ?? '', template, status, page, pageSize: PAGE_SIZE })}`);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search recipient or subject" className="relative block w-full sm:max-w-sm" />
        <FilterSelect
          label="Email type"
          value={template}
          onChange={value => update({ template: value || null })}
          options={[{ value: '', label: 'All types' }, ...EMAIL_TEMPLATE_TYPES.map(value => ({ value, label: TEMPLATE_LABELS[value] ?? value }))]}
        />
        <FilterSelect
          label="Result"
          value={status}
          onChange={value => update({ status: value || null })}
          options={[
            { value: '', label: 'Any result' },
            { value: 'sent', label: 'Sent' },
            { value: 'failed', label: 'Failed' },
            { value: 'skipped', label: 'Skipped' },
          ]}
          className="sm:w-40"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
        {error ? (
          <ErrorState description={errorMessage(error)} onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonRows rows={8} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<Mail />} title={params.get('q') || template || status ? 'No emails match these filters' : 'No emails have been sent yet'} />
        ) : (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Recipient</Th>
                    <Th>Subject</Th>
                    <Th>Type</Th>
                    <Th>Result</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(log => (
                    <Tr key={log.id} className="cursor-pointer" onClick={() => setSelected(log)}>
                      <Td className="whitespace-nowrap text-sm text-muted">{formatDateTime(log.createdAt)}</Td>
                      <Td className="max-w-[14rem] truncate">{log.recipientEmail}</Td>
                      <Td className="max-w-[20rem]">
                        <button type="button" className="max-w-full truncate text-left text-ink hover:text-accent" onClick={() => setSelected(log)}>
                          {log.subject || '(no subject)'}
                        </button>
                      </Td>
                      <Td className="whitespace-nowrap text-sm">{TEMPLATE_LABELS[log.templateType] ?? log.templateType}</Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          <EmailStatusBadge status={log.status} />
                          {log.deliveryStatus && log.deliveryStatus !== log.status && <EmailStatusBadge status={log.deliveryStatus} />}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={page} totalPages={Number(meta?.totalPages ?? 1)} total={Number(meta?.total ?? 0)} pageSize={PAGE_SIZE} onChange={next => update({ page: next })} className="border-t border-line" />
          </>
        )}
      </div>

      <EmailDialog log={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function EmailDialog({ log, onClose }: { log: EmailLog | null; onClose: () => void }) {
  const [showBody, setShowBody] = useState(false);
  const { data: body, error, isLoading } = useApi<{ html: string }>(log && showBody && log.hasBody ? `/api/admin/emails/logs/${log.id}` : null);

  const close = () => {
    setShowBody(false);
    onClose();
  };

  return (
    <Dialog open={log !== null} onClose={close} size="xl" title={log?.subject || '(no subject)'} description={log ? `To ${log.recipientEmail}` : undefined} footer={<Button onClick={close}>Close</Button>}>
      {log && (
        <div className="space-y-4">
          <dl className="divide-y divide-line">
            <DetailRow label="Sent">{formatDateTime(log.createdAt)}</DetailRow>
            <DetailRow label="Type">{TEMPLATE_LABELS[log.templateType] ?? log.templateType}</DetailRow>
            <DetailRow label="Result">
              <span className="flex flex-wrap items-center gap-2">
                <EmailStatusBadge status={log.status} />
                {log.deliveryStatus && (
                  <span className="text-sm text-muted">
                    Provider reported: <EmailStatusBadge status={log.deliveryStatus} />
                  </span>
                )}
              </span>
            </DetailRow>
            {log.attempts !== null && log.attempts > 1 && <DetailRow label="Attempts">{log.attempts}</DetailRow>}
            {log.provider && <DetailRow label="Provider">{log.provider}</DetailRow>}
            {log.errorMessage && (
              <DetailRow label="Error">
                <span className="whitespace-pre-wrap break-words text-danger">{log.errorMessage}</span>
              </DetailRow>
            )}
          </dl>

          {log.hasBody ? (
            showBody ? (
              error ? (
                <Callout tone="danger">{errorMessage(error)}</Callout>
              ) : isLoading || !body ? (
                <Skeleton className="h-[60dvh]" />
              ) : (
                <SafeEmailFrame html={body.html} title={`Copy of the email “${log.subject ?? ''}”`} />
              )
            ) : (
              <Button onClick={() => setShowBody(true)}>Show the stored copy</Button>
            )
          ) : (
            <p className="text-sm text-muted">
              {['otp', 'reset', 'invite'].includes(log.templateType)
                ? 'Emails with sign-in codes or access links are never stored.'
                : 'No copy of this email was kept. Turn on “Keep a copy of sent digest and broadcast emails” in Settings to store future ones.'}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
