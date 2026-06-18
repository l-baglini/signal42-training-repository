'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { api, type UsageSummary } from '@/lib/api-client';
import { useUiStore } from '@/lib/store';
import { cn, formatUsd } from '@/lib/utils';

export function UsageIndicator() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const refreshNonce = useUiStore((s) => s.refreshNonce);

  useEffect(() => {
    let alive = true;
    api
      .usageSummary()
      .then((s) => alive && setSummary(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [refreshNonce]);

  const pct = summary?.pct ?? null;
  const clamped = pct === null ? 0 : Math.min(pct, 100);
  const tone =
    pct === null
      ? 'from-slate-500 to-slate-400'
      : pct < 70
        ? 'from-emerald-400 to-teal-400'
        : pct < 100
          ? 'from-amber-400 to-orange-400'
          : 'from-rose-500 to-red-500';

  return (
    <button
      onClick={() => setActiveTab('usage')}
      title="Apri il dettaglio consumi"
      className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.07]"
    >
      <Activity className="h-4 w-4 text-indigo-300" />
      <div className="min-w-[150px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-300">
            Consumo Claude
          </span>
          <span className="text-xs font-semibold text-white">
            {summary ? formatUsd(summary.periodSpendUsd) : '—'}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={cn(
              'h-full rounded-full bg-gradient-to-r transition-all',
              tone,
            )}
            style={{ width: `${clamped}%` }}
          />
        </div>
        <div className="mt-1 text-[10px] text-slate-500">
          {summary?.budgetUsd
            ? `${pct === null ? '' : Math.round(pct)}% di ${formatUsd(summary.budgetUsd)} / mese`
            : 'Budget non impostato'}
        </div>
      </div>
    </button>
  );
}
