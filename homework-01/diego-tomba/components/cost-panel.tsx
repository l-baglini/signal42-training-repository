'use client';

import { Coins, ArrowDownToLine, ArrowUpFromLine, DatabaseZap, Database } from 'lucide-react';
import type { ReportView } from '@/lib/api-client';
import { estimateCostBreakdown } from '@/lib/pricing';
import { formatUsd } from '@/lib/utils';

const nf = new Intl.NumberFormat('it-IT');

function Row({
  icon: Icon,
  label,
  tokens,
  cost,
}: {
  icon: typeof Coins;
  label: string;
  tokens: number;
  cost: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2 text-slate-300">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-right">
        <div className="text-xs font-medium text-slate-200">
          {nf.format(tokens)} tok
        </div>
        {cost !== null && (
          <div className="text-[10px] text-slate-500">{formatUsd(cost)}</div>
        )}
      </div>
    </div>
  );
}

export function CostPanel({ report }: { report: ReportView }) {
  const tokens = {
    inputTokens: report.inputTokens,
    outputTokens: report.outputTokens,
    cacheCreationTokens: report.cacheCreationTokens,
    cacheReadTokens: report.cacheReadTokens,
  };
  const breakdown = estimateCostBreakdown(report.model, tokens);
  const totalTokens =
    tokens.inputTokens +
    tokens.outputTokens +
    tokens.cacheCreationTokens +
    tokens.cacheReadTokens;

  return (
    <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-slate-300">
        <Coins className="h-4 w-4 text-indigo-300" />
        <span className="text-xs font-semibold uppercase tracking-wide">
          Costo del report
        </span>
      </div>

      <div className="mt-3">
        <div className="text-2xl font-semibold text-white">
          {formatUsd(report.costUsd)}
        </div>
        <div className="text-[11px] text-slate-500">
          costo reale (SDK){report.model ? ` · ${report.model}` : ''}
        </div>
      </div>

      <div className="mt-4 border-t border-white/5 pt-2">
        <Row
          icon={ArrowDownToLine}
          label="Input"
          tokens={tokens.inputTokens}
          cost={breakdown?.input ?? null}
        />
        <Row
          icon={ArrowUpFromLine}
          label="Output"
          tokens={tokens.outputTokens}
          cost={breakdown?.output ?? null}
        />
        <Row
          icon={DatabaseZap}
          label="Cache write"
          tokens={tokens.cacheCreationTokens}
          cost={breakdown?.cacheWrite ?? null}
        />
        <Row
          icon={Database}
          label="Cache read"
          tokens={tokens.cacheReadTokens}
          cost={breakdown?.cacheRead ?? null}
        />
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2 text-xs">
        <span className="text-slate-400">Token totali</span>
        <span className="font-medium text-slate-200">
          {nf.format(totalTokens)}
        </span>
      </div>

      {breakdown ? (
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          I costi per tipologia sono una stima dalle tariffe del modello; il
          totale reale è quello riportato dall&apos;SDK.
        </p>
      ) : totalTokens > 0 ? (
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          Tariffe del modello non note: mostrati i conteggi token e il costo
          totale reale.
        </p>
      ) : (
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          Dettaglio token non disponibile per questo report.
        </p>
      )}
    </aside>
  );
}
