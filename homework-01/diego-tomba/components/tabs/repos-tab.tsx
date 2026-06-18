'use client';

import { useEffect, useState } from 'react';
import { Play, Trash2, Plus, Clock, CheckCircle2 } from 'lucide-react';
import { api, type WatchedRepoView } from '@/lib/api-client';
import { useUiStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Badge, Spinner, EmptyState } from '@/components/ui/misc';
import { formatUsd } from '@/lib/utils';

export function ReposTab() {
  const [repos, setRepos] = useState<WatchedRepoView[]>([]);
  const [owner, setOwner] = useState('');
  const [name, setName] = useState('');
  const [cron, setCron] = useState('');
  const [adding, setAdding] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ id: number; text: string; ok: boolean } | null>(null);
  const triggerRefresh = useUiStore((s) => s.triggerRefresh);

  const load = () => api.listRepos().then(setRepos);
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!owner || !name) return;
    setAdding(true);
    try {
      await api.createRepo({
        owner,
        name,
        platform: 'github',
        scheduleCron: cron || null,
      });
      setOwner('');
      setName('');
      setCron('');
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function run(repo: WatchedRepoView) {
    setRunningId(repo.id);
    setMsg(null);
    try {
      const res = await api.runRepo(repo.id);
      setMsg({
        id: repo.id,
        ok: true,
        text: `Report #${res.reportId} · ${res.eventsProcessed} eventi · ${formatUsd(res.costUsd)}`,
      });
      triggerRefresh();
    } catch (e) {
      setMsg({ id: repo.id, ok: false, text: (e as Error).message });
    } finally {
      setRunningId(null);
    }
  }

  async function toggleSchedule(repo: WatchedRepoView) {
    await api.updateRepo(repo.id, { enabled: !repo.enabled });
    await load();
  }

  async function remove(id: number) {
    await api.deleteRepo(id);
    await load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end">
            <div>
              <Label>Owner</Label>
              <Input
                placeholder="prebid"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </div>
            <div>
              <Label>Repository</Label>
              <Input
                placeholder="Prebid.js"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>Cron (opzionale)</Label>
              <Input
                placeholder="0 9 * * 1  (lun. 09:00)"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
              />
            </div>
            <Button onClick={add} disabled={adding || !owner || !name}>
              {adding ? <Spinner /> : <Plus className="h-4 w-4" />}
              Aggiungi
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Il cron è eseguito dal worker schedulato (<code>npm run worker</code>).
            Lascia vuoto per il solo monitoraggio on-demand.
          </p>
        </CardContent>
      </Card>

      {repos.length === 0 ? (
        <EmptyState
          title="Nessun repository monitorato"
          hint="Aggiungi il primo repository qui sopra."
        />
      ) : (
        <div className="space-y-3">
          {repos.map((repo) => (
            <Card key={repo.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {repo.owner}/{repo.name}
                    </span>
                    <Badge tone="accent">{repo.platform}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    {repo.scheduleCron ? (
                      <button
                        onClick={() => toggleSchedule(repo)}
                        className="inline-flex items-center gap-1 hover:text-slate-200"
                      >
                        <Clock className="h-3 w-3" />
                        <code>{repo.scheduleCron}</code>
                        <Badge tone={repo.enabled ? 'success' : 'neutral'}>
                          {repo.enabled ? 'attivo' : 'in pausa'}
                        </Badge>
                      </button>
                    ) : (
                      <span className="text-slate-500">solo on-demand</span>
                    )}
                  </div>
                  {msg && msg.id === repo.id && (
                    <p
                      className={`mt-2 text-xs ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}
                    >
                      {msg.ok && (
                        <CheckCircle2 className="mr-1 inline h-3 w-3" />
                      )}
                      {msg.text}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => run(repo)}
                    disabled={runningId === repo.id}
                  >
                    {runningId === repo.id ? (
                      <Spinner />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Genera report
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(repo.id)}
                    title="Rimuovi"
                  >
                    <Trash2 className="h-4 w-4 text-rose-300" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
