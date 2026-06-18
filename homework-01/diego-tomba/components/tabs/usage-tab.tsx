'use client';

import { useEffect, useState } from 'react';
import {
  api,
  type UsageSummary,
  type UsageHistory,
} from '@/lib/api-client';
import { useUiStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { UsageByTask } from '@/components/charts/usage-by-task';
import { formatUsd } from '@/lib/utils';

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent>
        <div className="text-xs uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function UsageTab() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [history, setHistory] = useState<UsageHistory | null>(null);
  const refreshNonce = useUiStore((s) => s.refreshNonce);

  useEffect(() => {
    api.usageSummary().then(setSummary);
    api.usageHistory().then(setHistory);
  }, [refreshNonce]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Speso questo mese"
          value={summary ? formatUsd(summary.periodSpendUsd) : '—'}
        />
        <Kpi
          label="Budget mensile"
          value={summary?.budgetUsd ? formatUsd(summary.budgetUsd) : 'non impostato'}
        />
        <Kpi
          label="% budget usato"
          value={summary?.pct != null ? `${Math.round(summary.pct)}%` : '—'}
        />
        <Kpi label="Run nel periodo" value={summary ? String(summary.runs) : '—'} />
      </div>

      <p className="text-xs text-slate-500">
        Nota: Anthropic non espone un saldo/credito residuo via SDK. Questo
        pannello mostra il consumo reale tracciato localmente (costo per run
        riportato dall&apos;SDK) confrontato con il budget impostato.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Spesa per task type (mese corrente)</CardTitle>
        </CardHeader>
        <CardContent>
          <UsageByTask data={summary?.byTaskType ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stime per task type</CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.estimates.length === 0 ? (
            <EmptyState title="Nessuna stima ancora" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4 font-medium">Task</th>
                    <th className="py-2 pr-4 font-medium">Campioni</th>
                    <th className="py-2 pr-4 font-medium">Costo medio</th>
                    <th className="py-2 pr-4 font-medium">p90</th>
                    <th className="py-2 font-medium">Budget suggerito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.estimates.map((e) => (
                    <tr key={e.taskType} className="text-slate-200">
                      <td className="py-2 pr-4 font-mono text-xs">
                        {e.taskType}
                      </td>
                      <td className="py-2 pr-4">{e.sampleSize}</td>
                      <td className="py-2 pr-4">{formatUsd(e.costMean)}</td>
                      <td className="py-2 pr-4">{formatUsd(e.costP90)}</td>
                      <td className="py-2">{formatUsd(e.suggestedBudgetUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
