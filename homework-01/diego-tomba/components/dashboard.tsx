'use client';

import { Telescope, Settings2, FolderGit2, History, Wand2, Activity } from 'lucide-react';
import { useUiStore, type TabId } from '@/lib/store';
import { cn } from '@/lib/utils';
import { UsageIndicator } from '@/components/usage-indicator';
import { SetupTab } from '@/components/tabs/setup-tab';
import { ReposTab } from '@/components/tabs/repos-tab';
import { HistoryTab } from '@/components/tabs/history-tab';
import { PromptsTab } from '@/components/tabs/prompts-tab';
import { UsageTab } from '@/components/tabs/usage-tab';

const TABS: { id: TabId; label: string; icon: typeof Settings2 }[] = [
  { id: 'setup', label: 'Setup', icon: Settings2 },
  { id: 'repos', label: 'Repository', icon: FolderGit2 },
  { id: 'history', label: 'Storico', icon: History },
  { id: 'prompts', label: 'Prompt', icon: Wand2 },
  { id: 'usage', label: 'Consumi', icon: Activity },
];

export function Dashboard() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg shadow-indigo-500/30">
            <Telescope className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              RepoWatcher
            </h1>
            <p className="text-xs text-slate-400">
              Monitoraggio repo + storytelling AI
            </p>
          </div>
        </div>
        <UsageIndicator />
      </header>

      <nav className="mt-8 flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition',
                active
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="mt-8">
        {activeTab === 'setup' && <SetupTab />}
        {activeTab === 'repos' && <ReposTab />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'prompts' && <PromptsTab />}
        {activeTab === 'usage' && <UsageTab />}
      </main>
    </div>
  );
}
