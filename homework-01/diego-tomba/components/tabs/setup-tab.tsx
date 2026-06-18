'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Check } from 'lucide-react';
import { api, type SettingsView } from '@/lib/api-client';
import { useUiStore } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Badge, Spinner } from '@/components/ui/misc';

export function SetupTab() {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [githubToken, setGithubToken] = useState('');
  const [anthropicToken, setAnthropicToken] = useState('');
  const [budget, setBudget] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const triggerRefresh = useUiStore((s) => s.triggerRefresh);

  const load = () =>
    api.getSettings().then((s) => {
      setSettings(s);
      setBudget(s.monthlyBudgetUsd ? String(s.monthlyBudgetUsd) : '');
    });

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api.updateSettings({
        githubToken: githubToken || undefined,
        anthropicToken: anthropicToken || undefined,
        monthlyBudgetUsd: budget === '' ? undefined : Number(budget),
      });
      setGithubToken('');
      setAnthropicToken('');
      await load();
      triggerRefresh();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Credenziali</CardTitle>
          <CardDescription>
            Inserisci i token necessari. Sono salvati localmente nel database
            (uso personale, singolo utente).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>GitHub Access Token</Label>
            <Input
              type="password"
              placeholder={
                settings?.githubToken.set
                  ? `Configurato (••••${settings.githubToken.last4})`
                  : 'ghp_…'
              }
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
            <a
              href="https://github.com/settings/tokens/new"
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
            >
              Crea un token (scope <code className="mx-1">public_repo</code> +
              <code className="mx-1">read:project</code>)
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div>
            <Label>Claude / Anthropic API Key</Label>
            <Input
              type="password"
              placeholder={
                settings?.anthropicToken.set
                  ? `Configurato (••••${settings.anthropicToken.last4})`
                  : 'sk-ant-…'
              }
              value={anthropicToken}
              onChange={(e) => setAnthropicToken(e.target.value)}
            />
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
            >
              Crea una API key
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="max-w-xs">
            <Label>Budget mensile (USD)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="es. 10"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Usato per l&apos;indicatore di consumo. 0 = nessun budget.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={save} disabled={saving}>
              {saving && <Spinner />}
              Salva impostazioni
            </Button>
            {saved && (
              <Badge tone="success">
                <Check className="h-3 w-3" /> Salvato
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {settings && (
        <div className="flex flex-wrap gap-2">
          <Badge tone={settings.githubToken.set ? 'success' : 'warning'}>
            GitHub: {settings.githubToken.set ? 'configurato' : 'mancante'}
          </Badge>
          <Badge tone={settings.anthropicToken.set ? 'success' : 'warning'}>
            Claude: {settings.anthropicToken.set ? 'configurato' : 'mancante'}
          </Badge>
        </div>
      )}
    </div>
  );
}
