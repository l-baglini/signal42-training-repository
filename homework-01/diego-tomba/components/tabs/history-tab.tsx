'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, X } from 'lucide-react';
import {
  api,
  type ReportListItem,
  type ReportView,
  type UsageHistory,
} from '@/lib/api-client';
import { useUiStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { SpendOverTime } from '@/components/charts/spend-over-time';
import { CostPanel } from '@/components/cost-panel';
import { formatUsd } from '@/lib/utils';

export function HistoryTab() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [history, setHistory] = useState<UsageHistory | null>(null);
  const [open, setOpen] = useState<ReportView | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const refreshNonce = useUiStore((s) => s.refreshNonce);

  useEffect(() => {
    api.listReports(100).then(setReports);
    api.usageHistory().then(setHistory);
  }, [refreshNonce]);

  async function openReport(id: number) {
    setLoadingReport(true);
    try {
      setOpen(await api.getReport(id));
    } finally {
      setLoadingReport(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Consumi nel tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <SpendOverTime data={history?.series ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report prodotti</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <EmptyState
              title="Nessun report"
              hint="Genera un report dalla scheda Repository."
            />
          ) : (
            <div className="divide-y divide-white/5">
              {reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openReport(r.id)}
                  className="flex w-full items-center justify-between gap-4 py-3 text-left transition hover:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-indigo-300" />
                    <div>
                      <div className="text-sm font-medium text-white">
                        {r.repoOwner}/{r.repoName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(r.generatedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{r.eventsProcessed} eventi</Badge>
                    <Badge tone="accent">{formatUsd(r.costUsd)}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(open || loadingReport) && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(null)}
        >
          <Card
            className="my-8 w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {open ? `${open.repoOwner}/${open.repoName}` : 'Caricamento…'}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {loadingReport || !open ? (
                <div className="flex justify-center py-10">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : (
                <div className="flex flex-col gap-5 lg:flex-row-reverse">
                  <div className="lg:w-64 lg:shrink-0">
                    <CostPanel report={open} />
                  </div>
                  <article className="prose-invert min-w-0 flex-1 text-sm leading-relaxed text-slate-200 [&_a]:text-indigo-300 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_h1]:mt-0 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-white [&_li]:my-1 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {open.markdown}
                    </ReactMarkdown>
                  </article>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
